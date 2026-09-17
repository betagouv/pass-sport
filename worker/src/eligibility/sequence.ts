import type { Job, Queue } from "bullmq";
import {
  type ApiParticulierClient,
  RESOURCE_META,
  toCnousParams,
  toDssParams,
  toQfParams,
} from "./client";
import { API_PARTICULIER_VALIDATION_STATUS } from "./calls";
import { createCheckpointRunner } from "./checkpoint";
import type { ApiParticulierRateGate } from "./rate-gate";
import type { HistoryRecorder } from "../db/history";
import {
  AAH_BIRTHDATE_MAX,
  AAH_BIRTHDATE_MIN,
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  CROUS_BIRTHDATE_MAX,
  CROUS_BIRTHDATE_MIN,
  FRANCE_COG_INSEE,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  householdQfCovers,
  isWithinBirthdateWindow,
  pivotIsHouseholdChild,
  qfReferenceMonths,
  toIsoDate,
  type EligibilityJobData,
  type PersonneQuotientFamilial,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceResult,
} from "./types";
import { isAahBeneficiaryRow, readQuotientFamilial } from "./verdicts";

// Synthetic pivot identity for a QF child (reuses the identité param builders).
// Children carry no birth COG — the parent's is used.
export const enfantToIdentity = (
  enfant: PersonneQuotientFamilial,
  parent: PivotIdentity,
): PivotIdentity | null => {
  const familyName = enfant.nom_naissance;
  const birthdate = toIsoDate(enfant.date_naissance);

  if (!familyName || !enfant.prenoms || !birthdate) return null;

  return {
    family_name: familyName,
    given_name: enfant.prenoms,
    gender: enfant.sexe === "F" ? "female" : enfant.sexe === "M" ? "male" : undefined,
    birthdate,
    birthplace: parent.birthplace,
    // FranceConnect does not always serve birthcountry, and AEEH refuses a query without one.
    birthcountry: parent.birthcountry || FRANCE_COG_INSEE,
  };
};

// One planned per-child AEEH call. A child is queried only when all three hold:
//   - the QF row yields a usable pivot (name + prénoms + date de naissance);
//   - they are 6-19 ans (AEEH_BIRTHDATE_MIN/MAX) — outside that window candidates.ts can
//     never grant AEEH, so an appel would be pure quota burn;
//   - the household quotient does NOT already cover them. QF has priority over the whole
//     2009-2020 overlap: an eligible household is only ever charged for its 18-19 ans.
type ChildCheck = { childIndex: number; identity: PivotIdentity };

const planChildrenChecks = (
  enfants: PersonneQuotientFamilial[],
  parent: PivotIdentity,
  qfCovers: boolean,
): ChildCheck[] =>
  enfants.flatMap((enfant, childIndex) => {
    const identity = enfantToIdentity(enfant, parent);
    if (!identity) return [];

    const { birthdate } = identity;
    if (!isWithinBirthdateWindow(birthdate, AEEH_BIRTHDATE_MIN, AEEH_BIRTHDATE_MAX)) return [];
    if (qfCovers && isWithinBirthdateWindow(birthdate, QF_BIRTHDATE_MIN, QF_BIRTHDATE_MAX)) {
      return [];
    }

    return [{ childIndex, identity }];
  });

// Without a commune, a second call would send exactly what was just refused.
const needsPaysOnlyRetry = (row: ResourceResult | undefined, identity: PivotIdentity): boolean =>
  row?.httpStatus === API_PARTICULIER_VALIDATION_STATUS && !!identity.birthplace;

// Sequential API Particulier chain: QF (month by month) -> [AAH] -> [CROUS] -> per child: AEEH.
// Nothing is selected by the usager any more: each resource is gated by its own birthdate
// window alone. Sequential on purpose (never Promise.all). Checkpoints after every success so a
// 429-interrupted job resumes instead of re-calling completed resources.
export async function runEligibilitySequence(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  client: ApiParticulierClient,
  queue: Queue<EligibilityJobData>,
  history: HistoryRecorder,
  rateGate: ApiParticulierRateGate,
  now: Date = new Date(),
): Promise<ResourceResult[]> {
  const checkpoint = createCheckpointRunner(job, queue, history, rateGate);
  const { identity } = data;

  // Always first: quotient_familial is the only source of the household's children. Swept over
  // the campaign months and stopped on the first one under the threshold — a further month
  // could no longer change the outcome and would only cost quota.
  for (const mois of qfReferenceMonths(now)) {
    const row = await checkpoint.run({
      key: `qf:${mois}`,
      resource: RESOURCE_META.qf.resource,
      subject: "self",
      params: toQfParams(identity, mois),
      invoke: () => client.quotientFamilial(identity, mois),
    });

    if (householdQfCovers(row?.data as QuotientFamilialData | null)) break;
  }

  const aahRow = isWithinBirthdateWindow(identity.birthdate, AAH_BIRTHDATE_MIN, AAH_BIRTHDATE_MAX)
    ? await checkpoint.run({
        key: "aah",
        resource: RESOURCE_META.aah.resource,
        subject: "self",
        params: toDssParams(identity),
        invoke: () => client.aah(identity),
      })
    : undefined;

  // The only short-circuit of the chain, and it stays within one subject: a second route for an
  // allocataire the AAH already carries would change nothing about them.
  if (
    !isAahBeneficiaryRow(aahRow) &&
    isWithinBirthdateWindow(identity.birthdate, CROUS_BIRTHDATE_MIN, CROUS_BIRTHDATE_MAX)
  ) {
    await checkpoint.run({
      key: "cnous",
      resource: RESOURCE_META.cnous.resource,
      subject: "self",
      params: toCnousParams(identity),
      invoke: () => client.cnous(identity),
    });
  }

  // Every child is asked about, never just the first one to answer yes: each of them is a
  // beneficiary in their own right, with their own row and their own code.
  const qfData = readQuotientFamilial(checkpoint.results);
  const qfCovers = householdQfCovers(qfData);

  // The answer names the connected user as a child of the foyer rather than as one of its
  // allocataires: none of those children is theirs to apply for, so none is asked about. Sparing
  // the AEEH call matters beyond the quota — it is a handicap question about someone else's
  // children. candidates.ts gates the rows on the same predicate.
  const enfants = pivotIsHouseholdChild(qfData, identity.birthdate) ? [] : (qfData?.enfants ?? []);

  for (const check of planChildrenChecks(enfants, identity, qfCovers)) {
    const row = await checkpoint.run({
      key: `aeeh:${check.childIndex}`,
      resource: RESOURCE_META.aeeh.resource,
      subject: "enfant",
      childIndex: check.childIndex,
      params: toDssParams(check.identity),
      invoke: () => client.aeeh(check.identity, check.childIndex),
    });

    if (!needsPaysOnlyRetry(row, check.identity)) continue;

    // The commune sent is the parent's — the child has none of their own — so an incoherent
    // pays/commune pair is a plausible cause of the 422. Asked again without it, once.
    const paysOnlyIdentity: PivotIdentity = { ...check.identity, birthplace: undefined };

    await checkpoint.run({
      key: `aeeh:${check.childIndex}:pays`,
      resource: RESOURCE_META.aeeh.resource,
      subject: "enfant",
      childIndex: check.childIndex,
      params: toDssParams(paysOnlyIdentity),
      invoke: () => client.aeeh(paysOnlyIdentity, check.childIndex),
    });
  }

  return checkpoint.results;
}
