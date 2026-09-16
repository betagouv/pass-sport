import type { Job, Queue } from "bullmq";
import { type ApiParticulierClient } from "../eligibility/client";
import type { ApiParticulierRateGate } from "../eligibility/rate-gate";
import { API_PARTICULIER_VALIDATION_STATUS } from "../eligibility/calls";
import { runEligibilitySequence } from "../eligibility/sequence";
import { readCaisse, readQuotientFamilial } from "../eligibility/verdicts";
import {
  ORGANISME_BOURSIER,
  RESULT_SITUATION_BOURSIER,
  toResultSituation,
  type EligibilityJobData,
} from "../eligibility/types";
import { listBeneficiaryCandidates, readConjointIdentite } from "../eligibility/candidates";
import { recordEmailDelivery, sendAcknowledgmentEmail } from "../email/notify";
import type { HistoryRecorder } from "../db/history";
import { startJob } from "./shared";
import type { Database } from "../db/client";
import { eligibilityResults, type AllocataireIdentite, type Verdict } from "../db/schema";
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

// Processes one eligibility job end-to-end: accusé de réception -> API Particulier chain
// -> one Postgres row per beneficiary. No LCA call and no outcome email: the code is minted
// later by the data/ pipeline, which picks the 'eligible_pending' rows written here.
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
  const { apiClient, db: database, queue, rateGate, now } = deps;

  console.log(`[pass-sport-worker] job ${job.id}: eligibility chain`);

  const history = await startJob(job, database, data.identity.sub ?? null, data);

  // Sent before the asynchronous treatment, and the only mail this path ever sends.
  await acknowledgeReception(job, database, history, data, queue);

  const results = await runEligibilitySequence(
    job,
    data,
    apiClient,
    queue,
    history,
    rateGate,
    now?.(),
  );

  const { identity, isFranceConnected } = data;
  const rejectedResources = results
    .filter((r) => r.httpStatus === API_PARTICULIER_VALIDATION_STATUS)
    .map((r) => ({
      resource: r.resource,
      child_index: r.childIndex ?? null,
      error: r.error ?? null,
    }));
  const candidates = listBeneficiaryCandidates(identity, results);
  const qfPayload = readQuotientFamilial(results);
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

  // Two verdicts only. A genuine outage never reaches here — assertApiParticulierAnswered fails
  // the job instead — but a 422 does, and the refusal it feeds is pronounced without that
  // resource ever having answered: rejectedResources below is what says which.
  const outcomes: BeneficiaryOutcome[] = candidates.map((candidate) => {
    const isEligible = candidate.eligibilities.length > 0;
    return {
      source: candidate.source,
      isEligible,
      verdict: isEligible ? "eligible_pending" : "not_eligible",
    };
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
      for (const [index, candidate] of candidates.entries()) {
        // allocataire = connected FranceConnect user, enfant = the QF child ('self' rows leave enfant_* NULL).
        const isEnfant = candidate.source === "enfant";
        const enfantIdentite = isEnfant
          ? {
              family_name: candidate.lastname,
              preferred_username: candidate.nomUsage,
              given_name: candidate.firstname,
              birthdate: candidate.birthdate,
              gender: candidate.gender,
            }
          : null;

        // First rather than only: the two routes a candidate can carry are pushed in priority
        // order by listBeneficiaryCandidates (QF before AEEH, AAH before CROUS). Null on the
        // rows that opened no route at all, which are the 'not_eligible' ones.
        const aide = candidate.eligibilities[0];
        const situation = aide ? toResultSituation(aide) : null;

        await tx.insert(eligibilityResults).values({
          jobId: job.id ?? null,
          source: candidate.source,
          allocataireIdentite,
          allocataireConjointIdentite: conjointIdentite,
          allocataireFcSub: identity.sub ?? null,
          enfantIdentite,
          isEligible: outcomes[index].isEligible,
          isFranceConnected,
          residenceInsee: null,
          // Nothing was ever asked of LCA on this path.
          lcaStatus: "not_applicable",
          verdict: outcomes[index].verdict,
          passSportCode: null,
          // No outcome email is sent HERE — the code does not exist yet. The template is named
          // later, by the fc_code_emails job, and a null email_kind is exactly how that job
          // recognises a row of this path as never mailed.
          emailKind: null,
          emailSent: false,
          email: to,
          situation,
          caisse: situation === RESULT_SITUATION_BOURSIER ? ORGANISME_BOURSIER : householdCaisse,
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
