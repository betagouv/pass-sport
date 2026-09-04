import type { Job, Queue } from "bullmq";
import {
  type ApiParticulierClient,
  RESOURCE_META,
  toCnousParams,
  toDssParams,
  toQfParams,
} from "./client";
import { createCheckpointRunner } from "./checkpoint";
import type { HistoryRecorder } from "../db/history";
import {
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  ALLOWANCE,
  ALLOWANCE_RESOURCES,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  RESOURCE_ORDER,
  householdQfCovers,
  isWithinBirthdateWindow,
  type EligibilityJobData,
  type PersonneQuotientFamilial,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceKey,
  type ResourceResult,
} from "./types";

// QF dates come back as "AAAA-MM-JJ" or "JJ/MM/AAAA" — normalize to ISO.
export const toIsoBirthdate = (date?: string): string | undefined => {
  if (!date) return undefined;
  const fr = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);

  return undefined;
};

// Synthetic pivot identity for a QF child (reuses the identité param builders).
// Children carry no birth COG — the parent's is used.
export const enfantToIdentity = (
  enfant: PersonneQuotientFamilial,
  parent: PivotIdentity,
): PivotIdentity | null => {
  const familyName = enfant.nom_naissance;
  const birthdate = toIsoBirthdate(enfant.date_naissance);

  if (!familyName || !enfant.prenoms || !birthdate) return null;

  return {
    family_name: familyName,
    preferred_username: enfant.nom_usage || undefined,
    given_name: enfant.prenoms,
    gender: enfant.sexe === "F" ? "female" : enfant.sexe === "M" ? "male" : undefined,
    birthdate,
    birthplace: parent.birthplace,
    birthcountry: parent.birthcountry,
  };
};

// One planned per-child AEEH call. A child is queried only when all three hold:
//   - the QF row yields a usable pivot (name + prénoms + date de naissance);
//   - they are 17-19 ans (AEEH_BIRTHDATE_MIN/MAX) — younger or older children can
//     never be granted AEEH by candidates.ts, so an appel would be pure quota burn;
//   - the household quotient does NOT already cover them. QF has priority: on the
//     overlapping 2009 millésime an eligible household saves the call entirely.
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

// Sequential API Particulier chain: QF -> [AAH] -> [CROUS] -> per child: AEEH.
// Sequential on purpose (never Promise.all). Checkpoints after every success so a
// 429-interrupted job resumes instead of re-calling completed resources.
export async function runEligibilitySequence(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  client: ApiParticulierClient,
  queue: Queue<EligibilityJobData>,
  history: HistoryRecorder,
): Promise<ResourceResult[]> {
  const checkpoint = createCheckpointRunner(job, queue, history);

  const wanted = new Set<ResourceKey>(data.aides.flatMap((a) => ALLOWANCE_RESOURCES[a] ?? []));
  const parentKeys = RESOURCE_ORDER.filter((k) => wanted.has(k));

  const parentCall: Record<ResourceKey, () => Promise<ResourceResult>> = {
    qf: () => client.quotientFamilial(data.identity),
    aah: () => client.aah(data.identity),
    cnous: () => client.cnous(data.identity),
  };

  const parentParams: Record<ResourceKey, Record<string, unknown>> = {
    qf: toQfParams(data.identity),
    aah: toDssParams(data.identity),
    cnous: toCnousParams(data.identity),
  };

  for (const key of parentKeys) {
    await checkpoint.run({
      key,
      resource: RESOURCE_META[key].resource,
      subject: "self",
      params: parentParams[key],
      invoke: parentCall[key],
    });
  }

  // Per-child AEEH, fed by the QF response's enfants[].
  if (data.aides.includes(ALLOWANCE.AEEH)) {
    const qf = checkpoint.results.find(
      (r) => r.resource.startsWith("dss.quotient_familial") && r.success && r.data,
    );

    const qfData = qf?.data as QuotientFamilialData | undefined;
    const enfants = qfData?.enfants ?? [];
    const qfCovers = householdQfCovers(data.aides, qfData);

    for (const check of planChildrenChecks(enfants, data.identity, qfCovers)) {
      await checkpoint.run({
        key: `aeeh:${check.childIndex}`,
        resource: RESOURCE_META.aeeh.resource,
        subject: "enfant",
        childIndex: check.childIndex,
        params: toDssParams(check.identity),
        invoke: () => client.aeeh(check.identity, check.childIndex),
      });
    }
  }

  return checkpoint.results;
}
