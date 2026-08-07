import type { Job, Queue } from "bullmq";
import * as Sentry from "@sentry/node";
import {
  RESOURCE_META,
  toCnousParams,
  toDssParams,
  type ApiParticulierClient,
} from "../eligibility/client";
import { createCheckpointRunner } from "../eligibility/checkpoint";
import { enfantToIdentity } from "../eligibility/sequence";
import {
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  QF_ELIGIBILITY_THRESHOLD,
  SITUATION,
  isChildAide,
  isWithinBirthdateWindow,
  type ApiParticulierJobData,
  type ApiParticulierJobPayload,
  type EligibilityCheckpoint,
  type EtudiantBoursierData,
  type PersonneQuotientFamilial,
  type QuotientFamilialData,
  type ResourceResult,
  type StatutBeneficiaireData,
} from "../eligibility/types";
import type { LcaClient } from "../lca/client";
import { ageAtReferenceDate, childStatusVerdict, toIsoDate } from "../lca/candidates";
import {
  SITUATION_BY_AIDE,
  buildDirectConfirmPayload,
  buildDirectSearchPayload,
  declarationMatches,
  isBoursierAide,
} from "../lca/direct";
import {
  DEFAULT_INSEE_CODE,
  isLcaError,
  recordLcaConfirm,
  recordLcaSearch,
} from "../lca/history";
import type { LcaError } from "../lca/types";
import { startTimer, type HistoryRecorder } from "../db/history";
import { eligibilityResults, type Verdict } from "../db/schema";
import { logPii } from "../log";
import { emailKindFor, sendJobDigest, startJob, verdictFor, type Database } from "./shared";

export type ApiParticulierDeps = {
  apiClient: ApiParticulierClient;
  lcaClient: LcaClient;
  db: Database;
  queue: Queue<ApiParticulierJobData>;
};

// 'confirmed' carries a code by construction, like CandidateResult on the FranceConnect
// path: an answer without an id_psp is reported as 'not_found'.
type LcaOutcome =
  | { status: "confirmed"; passSportCode: string; courriel?: string }
  | { status: "not_found" | "error" };

// A 5xx is the gateway falling over, worth another attempt. Anything else — a 4xx, or a
// 200 carrying a business message — is LCA having nothing for this person, which is the
// case API Particulier exists to catch.
const isRetryable = (e: LcaError): boolean => (e.httpStatus ?? 0) >= 500;

const normalizeName = (value?: string): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Birthdate and nom must match exactly; the prénom matches on any single token, because a
// caisse stores every prénom ("MARIE LOUISE") where a parent types one.
export const matchChild = (
  enfants: PersonneQuotientFamilial[],
  beneficiary: ApiParticulierJobPayload["beneficiary"],
): number => {
  const wantedLastname = normalizeName(beneficiary.lastname);
  const wantedFirstnames = new Set(normalizeName(beneficiary.firstname).split(" ").filter(Boolean));

  return enfants.findIndex((enfant) => {
    if (toIsoDate(enfant.date_naissance) !== beneficiary.birthdate) return false;

    const lastnames = [enfant.nom_usage, enfant.nom_naissance].map(normalizeName).filter(Boolean);
    if (!lastnames.includes(wantedLastname)) return false;

    return normalizeName(enfant.prenoms)
      .split(" ")
      .filter(Boolean)
      .some((token) => wantedFirstnames.has(token));
  });
};

async function runLcaDirect(
  lca: LcaClient,
  data: ApiParticulierJobPayload,
  history: HistoryRecorder,
): Promise<LcaOutcome> {
  const subject = isBoursierAide(data.aide) || data.aide === SITUATION.AAH ? "self" : "enfant";

  const payload = buildDirectSearchPayload(data);

  const searchTimer = startTimer();
  let search = await lca.search(payload);
  await recordLcaSearch(
    {
      history,
      action: "lca.search",
      subject,
      durationMs: searchTimer(),
      extra: { is_from_crous: !!payload.isFromCrous },
    },
    search,
  );

  if (isLcaError(search)) {
    if (isRetryable(search)) throw new Error(`LCA /search unavailable: ${search.message}`);
    return { status: "error" };
  }

  if (search.length === 0 && payload.isFromCrous) {
    const retryTimer = startTimer();
    const retry = await lca.search({ ...payload, recipientResidencePlace: DEFAULT_INSEE_CODE });
    await recordLcaSearch(
      {
        history,
        action: "lca.search.crous_retry",
        subject,
        durationMs: retryTimer(),
        extra: { insee_fallback: DEFAULT_INSEE_CODE },
      },
      retry,
    );

    if (isLcaError(retry)) {
      if (isRetryable(retry)) throw new Error(`LCA /search unavailable: ${retry.message}`);
      return { status: "error" };
    }
    search = retry;
  }

  if (search.length === 0) return { status: "not_found" };

  const item = search[0];

  // The browser used to stop here and ask the usager to correct step 1. Asynchronously
  // there is nobody to ask, so this becomes "LCA has nothing" and the job carries on to
  // API Particulier.
  if (!declarationMatches(data, item)) {
    await history.record({
      actor: "lca",
      action: "lca.search.declaration_mismatch",
      status: "not_found",
      subject,
      payload: {
        declared: { aide: data.aide, situation: SITUATION_BY_AIDE[data.aide], caisse: data.caisse },
        answered: { situation: item.situation, organisme: item.organisme },
      },
    });
    return { status: "not_found" };
  }

  const confirmPayload = buildDirectConfirmPayload(data, item);

  const confirmTimer = startTimer();
  let confirm = await lca.confirm(confirmPayload, item);
  await recordLcaConfirm(
    { history, action: "lca.confirm", subject, durationMs: confirmTimer() },
    confirm,
  );

  if (isLcaError(confirm)) {
    if (isRetryable(confirm)) throw new Error(`LCA /confirm unavailable: ${confirm.message}`);
    return { status: "error" };
  }

  if (confirm.length === 0 && isBoursierAide(data.aide) && data.ine) {
    const retryTimer = startTimer();
    const retry = await lca.confirm(
      { ...confirmPayload, recipientBirthPlace: DEFAULT_INSEE_CODE },
      item,
    );
    await recordLcaConfirm(
      {
        history,
        action: "lca.confirm.boursier_retry",
        subject,
        durationMs: retryTimer(),
        extra: { insee_fallback: DEFAULT_INSEE_CODE },
      },
      retry,
    );

    if (isLcaError(retry)) {
      if (isRetryable(retry)) throw new Error(`LCA /confirm unavailable: ${retry.message}`);
      return { status: "error" };
    }
    confirm = retry;
  }

  const confirmed = confirm[0];
  if (!confirmed?.id_psp) return { status: "not_found" };

  return {
    status: "confirmed",
    passSportCode: confirmed.id_psp,
    courriel: (confirmed.allocataire as { courriel?: string } | undefined)?.courriel,
  };
}

type ApVerdict = { eligible: boolean; reason: string; calls: number };

async function runSituationEligibility(
  job: Job<ApiParticulierJobData>,
  data: ApiParticulierJobData,
  client: ApiParticulierClient,
  queue: Queue<ApiParticulierJobData>,
  history: HistoryRecorder,
): Promise<ApVerdict> {
  const checkpoint = createCheckpointRunner(job, queue, history);

  const once = (
    key: string,
    resource: string,
    subject: "self" | "enfant",
    params: unknown,
    invoke: () => Promise<ResourceResult>,
    childIndex?: number,
  ): Promise<ResourceResult | undefined> =>
    checkpoint.run({ key, resource, subject, childIndex, params, invoke });

  const age = ageAtReferenceDate(data.beneficiary.birthdate);
  let calls = 0;

  const quotientFamilial = async (): Promise<QuotientFamilialData | null> => {
    calls += 1;
    const r = await once(
      "qf",
      RESOURCE_META.qf.resource,
      "self",
      toDssParams(data.allocataire),
      () => client.quotientFamilial(data.allocataire),
    );
    return (r?.success ? (r.data as QuotientFamilialData) : null) ?? null;
  };

  if (isChildAide(data.aide)) {
    const qf = await quotientFamilial();
    const enfants = qf?.enfants ?? [];
    const childIndex = matchChild(enfants, data.beneficiary);

    if (childIndex < 0) {
      await history.record({
        actor: "worker",
        action: "enfant.match",
        status: "not_found",
        subject: "enfant",
        payload: { children_returned: enfants.length },
      });
      return { eligible: false, reason: "no child of the household matches", calls };
    }

    if (data.aide === SITUATION.QF) {
      const valeur = qf?.quotient_familial?.valeur;
      const underThreshold = typeof valeur === "number" && valeur < QF_ELIGIBILITY_THRESHOLD;
      const inWindow = isWithinBirthdateWindow(
        data.beneficiary.birthdate,
        QF_BIRTHDATE_MIN,
        QF_BIRTHDATE_MAX,
      );
      return {
        eligible: underThreshold && inWindow,
        reason: `QF: quotient=${JSON.stringify(valeur)} (threshold ${QF_ELIGIBILITY_THRESHOLD}), age ${age} (6-17: ${inWindow})`,
        calls,
      };
    }

    // The per-child AEEH call is only worth its quota inside the 17-19 window, since
    // nothing outside it can be granted anyway.
    if (
      !isWithinBirthdateWindow(data.beneficiary.birthdate, AEEH_BIRTHDATE_MIN, AEEH_BIRTHDATE_MAX)
    ) {
      return { eligible: false, reason: `AEEH: age ${age} outside the 17-19 window`, calls };
    }

    const childIdentity = enfantToIdentity(enfants[childIndex], data.allocataire);
    if (!childIdentity) {
      return { eligible: false, reason: "AEEH: incomplete child identity", calls };
    }

    calls += 1;
    const r = await once(
      `aeeh:${childIndex}`,
      RESOURCE_META.aeeh.resource,
      "enfant",
      toDssParams(childIdentity),
      () => client.aeeh(childIdentity, childIndex),
      childIndex,
    );

    const verdict = childStatusVerdict(r);
    return {
      eligible: verdict === true,
      reason: `AEEH: status=${String(verdict)}, age ${age}`,
      calls,
    };
  }

  if (data.aide === SITUATION.AAH) {
    calls += 1;
    const r = await once(
      RESOURCE_META.aah.resource,
      RESOURCE_META.aah.resource,
      "self",
      toDssParams(data.allocataire),
      () => client.aah(data.allocataire),
    );
    const beneficiaire = r?.success ? (r.data as StatutBeneficiaireData)?.est_beneficiaire : false;
    const inWindow = age >= 16 && age <= 30;
    return {
      eligible: !!beneficiaire && inWindow,
      reason: `AAH: beneficiary=${!!beneficiaire}, age ${age} (16-30: ${inWindow})`,
      calls,
    };
  }

  if (data.aide === SITUATION.CROUS) {
    // The INE identifies the student outright, so it spares the whole identité pivot —
    // which is the case where the usager gave an INE and no commune de naissance.
    const useIne = !!data.ine;
    const meta = useIne ? RESOURCE_META.cnousIne : RESOURCE_META.cnous;

    calls += 1;
    const r = await once(
      meta.resource,
      meta.resource,
      "self",
      useIne ? { ine: data.ine } : toCnousParams(data.allocataire),
      () => (useIne ? client.cnousByIne(data.ine as string) : client.cnous(data.allocataire)),
    );

    const boursier = r?.success
      ? (r.data as EtudiantBoursierData)?.statut_boursier?.est_boursier
      : false;
    const inWindow = age < 28;
    return {
      eligible: !!boursier && inWindow,
      reason: `CROUS: boursier=${!!boursier} (${useIne ? "INE" : "identity"}), age ${age} (<28: ${inWindow})`,
      calls,
    };
  }

  // FSS is a bourse régionale, which the CNOUS bouquet does not cover. Recorded so the
  // trace shows a deliberate non-call rather than a forgotten branch.
  await history.record({
    actor: "api_particulier",
    action: "cnous.etudiant_boursier",
    status: "skipped",
    subject: "self",
    payload: { reason: "formations sanitaires et sociales: outside the API Particulier scope" },
  });
  return { eligible: false, reason: "FSS: no API Particulier route", calls };
}

export async function processApiParticulierJob(
  job: Job<ApiParticulierJobData>,
  data: ApiParticulierJobData,
  deps: ApiParticulierDeps,
): Promise<{
  verdict: Verdict;
  lcaStatus: string;
  emailed: boolean;
  apCalls: number;
  processedAt: string;
}> {
  const { apiClient, lcaClient, db: database, queue } = deps;

  console.log(`[pass-sport-worker] job ${job.id}: combined form, aide=${data.aide}`);

  const history = await startJob(job, database, null, data);

  // PHASE 1 — every external call, no write of our own.
  let lca: LcaOutcome;
  try {
    lca = await runLcaDirect(lcaClient, data, history);
  } catch (e) {
    // NO PII in the payload: these messages carry a status code, never query params.
    Sentry.captureException(e, { tags: { component: "lca", app: "worker" } });
    await history.record({
      actor: "lca",
      action: "lca.call",
      status: "error",
      error: (e as Error).message,
    });
    throw e;
  }

  console.log(`[pass-sport-worker] job ${job.id}: ← LCA ${lca.status}`);

  const confirmed = lca.status === "confirmed";
  const passSportCode = lca.status === "confirmed" ? lca.passSportCode : null;

  const ap = confirmed
    ? { eligible: false, reason: "not called: LCA already returned a code", calls: 0 }
    : await runSituationEligibility(job, data, apiClient, queue, history);

  logPii(`job ${job.id}: ${data.aide} -> LCA ${lca.status}; API Particulier ${ap.reason}`);

  // PHASE 2 — one beneficiary, so one row; no transaction to wrap.
  const isEligible = confirmed || ap.eligible;
  const source = isChildAide(data.aide) ? "enfant" : "self";

  const verdict = verdictFor(confirmed, isEligible);
  const emailKind = emailKindFor(confirmed, isEligible);

  const { sub: _sub, ...allocataireIdentite } = data.allocataire;

  await database.insert(eligibilityResults).values({
    jobId: job.id ?? null,
    source,
    allocataireIdentite,
    allocataireFcSub: null,
    enfantIdentite:
      source === "enfant"
        ? {
            family_name: data.beneficiary.lastname,
            given_name: data.beneficiary.firstname,
            birthdate: data.beneficiary.birthdate,
          }
        : null,
    isEligible,
    isFranceConnected: false,
    residenceInsee: data.residenceInsee,
    lcaStatus: lca.status,
    verdict,
    passSportCode,
    emailKind,
    emailSent: false,
    email: data.email,
  });

  await history.record({
    actor: "worker",
    action: "results.persisted",
    status: "success",
    payload: { rows: 1, verdict, lca_status: lca.status, reason: ap.reason },
  });

  const emailed = await sendJobDigest({
    job,
    database,
    history,
    // The address the usager typed wins over the one LCA holds: it is where they expect the
    // code, and on this path it is the only thing we asked them for.
    recipient: data.email || (lca.status === "confirmed" ? lca.courriel : undefined),
    entries: [
      {
        firstname: data.beneficiary.firstname,
        lastname: data.beneficiary.lastname,
        kind: emailKind,
        code: passSportCode ?? undefined,
      },
    ],
    allocataire: data.allocataire,
  });

  console.log(
    `[pass-sport-worker] job ${job.id}: ${ap.calls} AP calls, verdict=${verdict}, emailed=${emailed}`,
  );

  return {
    verdict,
    lcaStatus: lca.status,
    emailed,
    apCalls: ap.calls,
    processedAt: new Date().toISOString(),
  };
}
