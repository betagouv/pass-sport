import type { Job, Queue } from "bullmq";
import { RESOURCE_META, type ApiParticulierClient } from "../eligibility/client";
import type { ApiParticulierRateGate } from "../eligibility/rate-gate";
import { isProviderFailure, retryingWouldChangeNothing } from "../eligibility/calls";
import { runEligibilitySequence } from "../eligibility/sequence";
import { readCaisse, readQuotientFamilial } from "../eligibility/verdicts";
import {
  ORGANISME_BOURSIER,
  RESULT_SITUATION_BOURSIER,
  toResultSituation,
  type AllocataireConjointIdentite,
  type Caisse,
  type EligibilityJobData,
  type QuotientFamilialData,
  type ResourceResult,
} from "../eligibility/types";
import {
  listBeneficiaryCandidates,
  readConjointIdentite,
  type BeneficiaryCandidate,
} from "../eligibility/candidates";
import { recordEmailDelivery, sendAcknowledgmentEmail } from "../email/notify";
import type { HistoryRecorder } from "../db/history";
import { startJob } from "./shared";
import type { Database } from "../db/client";
import {
  eligibilityResults,
  type AllocataireIdentite,
  type EligibilityRow,
  type Verdict,
} from "../db/schema";
import { logPii } from "../log";

export type FranceConnectDeps = {
  apiClient: ApiParticulierClient;
  db: Database;
  queue: Queue<EligibilityJobData>;
  rateGate: ApiParticulierRateGate;
  // Decides which campaign months the quotient_familial sweep covers. Read per job rather than
  // captured once: a job requeued by a rate-limit pause can resume in a later month.
  now?: () => Date;
};

// Below the threshold the job is answered while the mail would still be in flight. The ceiling
// is configuration: what counts as a loaded queue depends on the cadence the rate gate is tuned
// to, not on anything here.
const DEFAULT_ACKNOWLEDGMENT_QUEUE_THRESHOLD = 12_000;

const acknowledgmentQueueThreshold = (): number => {
  const raw = process.env.ACKNOWLEDGMENT_QUEUE_THRESHOLD;

  if (!raw?.trim()) return DEFAULT_ACKNOWLEDGMENT_QUEUE_THRESHOLD;

  const threshold = Number(raw);

  if (!Number.isFinite(threshold) || threshold < 0) {
    console.warn(
      `[pass-sport-worker] ACKNOWLEDGMENT_QUEUE_THRESHOLD="${raw}" is not a job count, using ${DEFAULT_ACKNOWLEDGMENT_QUEUE_THRESHOLD}`,
    );
    return DEFAULT_ACKNOWLEDGMENT_QUEUE_THRESHOLD;
  }

  return threshold;
};

const pendingJobCount = async (queue: Queue<EligibilityJobData>): Promise<number> => {
  try {
    const counts = await queue.getJobCounts("wait", "delayed", "prioritized");
    return (counts.wait ?? 0) + (counts.delayed ?? 0) + (counts.prioritized ?? 0);
  } catch (err) {
    console.warn(`[pass-sport-worker] queue depth unreadable: ${(err as Error).message}`);
    return Number.POSITIVE_INFINITY;
  }
};

async function acknowledgeReception(
  job: Job<EligibilityJobData>,
  database: Database,
  history: HistoryRecorder,
  data: EligibilityJobData,
  queue: Queue<EligibilityJobData>,
): Promise<void> {
  if (data.acknowledged) return;

  const to = data.identity.email;

  if (!to) {
    await history.record({
      actor: "worker",
      action: "email.acknowledgment",
      status: "skipped",
      responsePayload: { reason: "no_recipient" },
    });
    return;
  }

  const pending = await pendingJobCount(queue);
  const threshold = acknowledgmentQueueThreshold();

  if (pending < threshold) {
    await history.record({
      actor: "worker",
      action: "email.acknowledgment",
      status: "skipped",
      responsePayload: { reason: "queue_below_threshold", pending, threshold },
    });
    return;
  }

  await recordEmailDelivery({
    job,
    database,
    history,
    kind: "acknowledgment",
    recipient: to,
    bodyPayload: { to, email_kind: "acknowledgment" },
    send: () => sendAcknowledgmentEmail(to, data.identity),
  });

  // After the send, not before: a crash in between costs a duplicate accusé de réception,
  // where marking first would cost the only one the usager gets.
  await job.updateData({ ...job.data, acknowledged: true });
}

export type BeneficiaryOutcome = {
  source: string;
  isEligible: boolean;
  verdict: Verdict;
};

export type RejectedResource = {
  resource: string;
  child_index: number | null;
  reason: string;
  http_status: number | null;
  error_code: string | null;
  error: string | null;
};

export type HouseholdAssessment = {
  results: ResourceResult[];
  candidates: BeneficiaryCandidate[];
  qfPayload: QuotientFamilialData | null;
  householdCaisse: Caisse | null;
  conjointIdentite: AllocataireConjointIdentite | null;
  rejectedResources: RejectedResource[];
};

// The API Particulier chain and everything read off it — who this job pronounces on, and the
// household-level facts their rows carry. Shared verbatim by the two processors: the initial
// demande (which inserts) and the relance (which only amends), so a right can never be judged
// one way on one path and another way on the other.
export async function assessHousehold(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  deps: FranceConnectDeps,
  history: HistoryRecorder,
): Promise<HouseholdAssessment> {
  const { apiClient, queue, rateGate, now } = deps;

  const results = await runEligibilitySequence(
    job,
    data,
    apiClient,
    queue,
    history,
    rateGate,
    now?.(),
  );

  const { identity } = data;
  // A child asked again on another pays de naissance leaves its rejected first row in the
  // results; naming it here would accuse a resource that did answer in the end.
  const answeredLater = (r: ResourceResult, index: number): boolean =>
    r.childIndex != null &&
    results.some(
      (other, otherIndex) =>
        otherIndex > index &&
        other.resource === r.resource &&
        other.childIndex === r.childIndex &&
        !retryingWouldChangeNothing(other),
    );

  const qfPayload = readQuotientFamilial(results);

  // Tolerated on the last attempt only. A QF month is covered by any other month that answered.
  const isUnansweredOutage = (r: ResourceResult, index: number): boolean =>
    isProviderFailure(r) &&
    (r.resource === RESOURCE_META.qf.resource ? !qfPayload : !answeredLater(r, index));

  const rejectedResources = results
    .filter(
      (r, index) =>
        (retryingWouldChangeNothing(r) && !answeredLater(r, index)) ||
        isUnansweredOutage(r, index),
    )
    .map((r) => ({
      resource: r.resource,
      child_index: r.childIndex ?? null,
      reason: isProviderFailure(r) ? "provider_error" : "validation",
      http_status: r.httpStatus ?? null,
      error_code: r.errorCode ?? null,
      error: r.error ?? null,
    }));
  const candidates = listBeneficiaryCandidates(identity, results);
  const householdCaisse = readCaisse(results);
  const conjointIdentite = readConjointIdentite(qfPayload, identity.birthdate);

  if (qfPayload) {
    const qfValue = qfPayload.quotient_familial?.valeur;

    logPii(`job ${job.id}: quotient familial=${JSON.stringify(qfValue)} (${typeof qfValue})`);
    logPii(`job ${job.id}: bloc quotient_familial=${JSON.stringify(qfPayload.quotient_familial)}`);
    logPii(`job ${job.id}: réponse QF brute=${JSON.stringify(qfPayload)}`);
  }

  for (const c of candidates) {
    logPii(
      `job ${job.id}: ${c.source} -> ${c.eligibilities.join(",") || "aucune aide"}${c.reasons.length ? ` (${c.reasons.join("; ")})` : ""}`,
    );
  }

  return { results, candidates, qfPayload, householdCaisse, conjointIdentite, rejectedResources };
}

export const toBeneficiaryRowValues = (
  candidate: BeneficiaryCandidate,
  householdCaisse: Caisse | null,
): Required<
  Pick<EligibilityRow, "source" | "enfantIdentite" | "isEligible" | "verdict" | "situation" | "caisse">
> => {
  // allocataire = connected FranceConnect user, enfant = the QF child ('self' rows leave enfant_* NULL).
  const enfantIdentite =
    candidate.source === "enfant"
      ? {
          family_name: candidate.lastname,
          preferred_username: candidate.nomUsage,
          given_name: candidate.firstname,
          birthdate: candidate.birthdate,
          gender: candidate.gender,
        }
      : null;

  // First rather than only: the two routes a candidate can carry are pushed in priority order by
  // listBeneficiaryCandidates (QF before AEEH, AAH before CROUS). Null on the rows that opened no
  // route at all, which are the 'not_eligible' ones.
  const aide = candidate.eligibilities[0];
  const situation = aide ? toResultSituation(aide) : null;
  const isEligible = aide !== undefined;

  return {
    source: candidate.source,
    enfantIdentite,
    isEligible,
    verdict: isEligible ? "eligible_pending" : "not_eligible",
    situation,
    caisse: situation === RESULT_SITUATION_BOURSIER ? ORGANISME_BOURSIER : householdCaisse,
  };
};

export async function processEligibilityJob(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  deps: FranceConnectDeps,
): Promise<{
  beneficiaries: number;
  outcomes: BeneficiaryOutcome[];
  apCalls: number;
  processedAt: string;
}> {
  const { db: database, queue } = deps;

  console.log(`[pass-sport-worker] job ${job.id}: eligibility chain`);

  const history = await startJob(job, database, data.identity.sub ?? null, data);

  await acknowledgeReception(job, database, history, data, queue);

  const { results, candidates, householdCaisse, conjointIdentite, rejectedResources } =
    await assessHousehold(job, data, deps, history);

  const { identity, isFranceConnected } = data;

  // Two verdicts only. Only a 422, or a provider outage on the last attempt, reaches here without
  // an answer: rejectedResources says which.
  const outcomes: BeneficiaryOutcome[] = candidates.map((candidate) => {
    const { isEligible, verdict } = toBeneficiaryRowValues(candidate, householdCaisse);
    return { source: candidate.source, isEligible, verdict };
  });

  // The `sub` is not part of the identité pivot and has its own indexed column, so
  // keep it out of the jsonb rather than storing it twice.
  const { sub: _sub, ...pivot } = identity;
  const allocataireIdentite: AllocataireIdentite = { ...pivot };

  // Where the accusé de réception went. Kept so a usager coming back can be told which mailbox
  // to look in.
  const to = identity.email ?? null;

  if (candidates.length === 0) {
    // Only reachable on an identité pivot missing a given_name or a birthdate: every other
    // no-route case now lands on the allocataire row listBeneficiaryCandidates falls back to. A
    // row here would have to name a beneficiary we cannot name, so nothing is written and
    // eligibility_history keeps the only trace of the run.
    //
    // The cost of that, for this residual case alone: applications_by_sub is derived from this
    // table, so the usager is not recognised as having applied and a reconnection re-runs the
    // whole API Particulier chain.
    console.log(`[pass-sport-worker] job ${job.id}: no beneficiary, nothing to record`);
    await history.record({
      actor: "worker",
      action: "results.skipped",
      status: "skipped",
      responsePayload: { rows: 0, reason: "no_beneficiary", rejected_resources: rejectedResources },
    });
  } else {
    console.log(
      `[pass-sport-worker] job ${job.id}: inserting ${candidates.length} eligibility_results rows in one transaction`,
    );

    // A single transaction: a failure here rolls the whole batch back, so a retry
    // cannot find half a job already written.
    await database.transaction(async (tx) => {
      for (const candidate of candidates) {
        await tx.insert(eligibilityResults).values({
          ...toBeneficiaryRowValues(candidate, householdCaisse),
          jobId: job.id ?? null,
          allocataireIdentite,
          allocataireConjointIdentite: conjointIdentite,
          allocataireFcSub: identity.sub ?? null,
          isFranceConnected,
          residenceInsee: null,
          // Nothing was ever asked of LCA on this path.
          lcaStatus: "not_applicable",
          passSportCode: null,
          // No outcome email is sent HERE — the code does not exist yet. The template is named
          // later, by the fc_code_emails job, and a null email_kind is exactly how that job
          // recognises a row of this path as never mailed.
          emailKind: null,
          emailSent: false,
          email: to,
        });
      }
    });

    await history.record({
      actor: "worker",
      action: "results.persisted",
      status: "success",
      responsePayload: {
        rows: candidates.length,
        reason: "batch",
        rejected_resources: rejectedResources,
      },
    });
  }

  console.log(
    `[pass-sport-worker] job ${job.id}: ${results.length} AP calls, ${candidates.length} beneficiaries`,
  );

  return {
    beneficiaries: candidates.length,
    outcomes,
    apCalls: results.length,
    processedAt: new Date().toISOString(),
  };
}
