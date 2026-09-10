import type { Job, Queue } from "bullmq";
import { type ApiParticulierClient } from "../eligibility/client";
import { runEligibilitySequence } from "../eligibility/sequence";
import { readQuotientFamilial } from "../eligibility/verdicts";
import type { EligibilityJobData, QuotientFamilialData } from "../eligibility/types";
import { listBeneficiaryCandidates } from "../lca/candidates";
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
  // Decides which campaign months the quotient_familial sweep covers. Read per job rather than
  // captured once: a job requeued by a rate-limit pause can resume in a later month.
  now?: () => Date;
};

async function acknowledgeReception(
  job: Job<EligibilityJobData>,
  database: Database,
  history: HistoryRecorder,
  data: EligibilityJobData,
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
  const { apiClient, db: database, queue, now } = deps;

  console.log(`[pass-sport-worker] job ${job.id}: eligibility chain`);

  const history = await startJob(job, database, data.identity.sub ?? null, data);

  // Sent before the asynchronous treatment, and the only mail this path ever sends.
  await acknowledgeReception(job, database, history, data);

  const results = await runEligibilitySequence(job, data, apiClient, queue, history, now?.());

  const { identity, isFranceConnected } = data;
  const candidates = listBeneficiaryCandidates(identity, results);
  const qfPayload = readQuotientFamilial(results);

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

  // Two verdicts only, and the negative one IS a refusal we are in a position to pronounce: both
  // sources this path consults return a determination rather than a silence — API Particulier
  // answers 404 / est_beneficiaire:false, and our own campaign windows exclude by age. A genuine
  // outage never reaches here, assertApiParticulierCallSuceeded fails the job instead.
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
      responsePayload: { rows: 0, reason: "no_beneficiary" },
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
              given_name: candidate.firstname,
              birthdate: candidate.birthdate,
              gender: candidate.gender,
            }
          : null;

        await tx.insert(eligibilityResults).values({
          jobId: job.id ?? null,
          source: candidate.source,
          allocataireIdentite,
          allocataireFcSub: identity.sub ?? null,
          enfantIdentite,
          isEligible: outcomes[index].isEligible,
          isFranceConnected,
          residenceInsee: null,
          // Nothing was ever asked of LCA on this path.
          lcaStatus: "not_applicable",
          verdict: outcomes[index].verdict,
          passSportCode: null,
          // No outcome email is sent, so there is no template to name.
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
      responsePayload: { rows: candidates.length, reason: "batch" },
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
