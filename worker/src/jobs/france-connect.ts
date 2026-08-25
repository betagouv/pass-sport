import type { Job, Queue } from "bullmq";
import { type ApiParticulierClient } from "../eligibility/client";
import { runEligibilitySequence } from "../eligibility/sequence";
import { ALLOWANCE, type EligibilityJobData, type QuotientFamilialData } from "../eligibility/types";
import { type LcaClient } from "../lca/client";
import { listBeneficiaryCandidates } from "../lca/candidates";
import { processCandidateThroughLca } from "../lca/process";
import type { DigestEntry } from "../email/notify";
import { emailKindFor, sendJobDigest, startJob, verdictFor, type Database, type EmailKind } from "./shared";
import { eligibilityResults, type AllocataireIdentite, type Verdict } from "../db/schema";
import { logPii } from "../log";

export type FranceConnectDeps = {
  apiClient: ApiParticulierClient;
  lcaClient: LcaClient;
  db: Database;
  queue: Queue<EligibilityJobData>;
};

export type BeneficiaryOutcome = {
  source: string;
  isEligible: boolean;
  lcaStatus: string;
  verdict: Verdict;
  emailKind: EmailKind | null;
  emailSent: boolean;
};

// Processes one eligibility job end-to-end: API Particulier chain -> LCA per
// beneficiary -> transactional email -> one Postgres row per beneficiary.
export async function processEligibilityJob(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  deps: FranceConnectDeps,
): Promise<{
  beneficiaries: number;
  confirmed: number;
  emailed: number;
  outcomes: BeneficiaryOutcome[];
  apCalls: number;
  processedAt: string;
}> {
  const { apiClient, lcaClient, db: database, queue } = deps;

  console.log(
    `[pass-sport-worker] job ${job.id}: eligibility chain for aides=[${data.aides.join(",")}]`,
  );

  const history = await startJob(job, database, data.identity.sub ?? null, data);

  const results = await runEligibilitySequence(job, data, apiClient, queue, history);

  // Every child + self (only if AAH/CROUS eligible) is processed.
  const { identity, isFranceConnected, residenceInsee } = data;
  const candidates = listBeneficiaryCandidates(identity, results, data.aides);
  const qfRow = results.find((r) => r.resource.startsWith("dss.quotient_familial") && r.success);

  if (qfRow) {
    const qfPayload = qfRow.data as QuotientFamilialData | null;
    const qfValue = qfPayload?.quotient_familial?.valeur;
    logPii(
      `job ${job.id}: quotient familial=${JSON.stringify(qfValue)} (${typeof qfValue}), route QF ${data.aides.includes(ALLOWANCE.QF) ? "demandée" : "NON demandée"}`,
    );
    logPii(
      `job ${job.id}: bloc quotient_familial=${JSON.stringify(qfPayload?.quotient_familial)}`,
    );
    logPii(`job ${job.id}: réponse QF brute=${JSON.stringify(qfPayload)}`);
  }

  for (const c of candidates) {
    logPii(
      `job ${job.id}: ${c.source} -> ${c.eligibilities.join(",") || "aucune aide"}${c.reasons.length ? ` (${c.reasons.join("; ")})` : ""}`,
    );
  }

  const worthAnLcaCall = (c: (typeof candidates)[number]): boolean =>
    c.source === "enfant" || c.eligibilities.includes(ALLOWANCE.AAH) || c.eligibilities.includes(ALLOWANCE.CROUS);

  const toProcess = candidates.filter(worthAnLcaCall);
  const skipped = candidates.filter((c) => !worthAnLcaCall(c));

  // PHASE 1 — every external call, no write of our own.
  let confirmed = 0;
  let recipient: string | undefined;

  const digest: DigestEntry[] = [];
  const pending: {
    candidate: (typeof candidates)[number];
    status: string;
    isEligible: boolean;
    verdict: Verdict;
    passSportCode: string | null;
    emailKind: EmailKind | null;
  }[] = [];

  for (const candidate of toProcess) {
    console.log(`[pass-sport-worker] job ${job.id}: → LCA ${candidate.source}`);

    logPii(`job ${job.id}: → LCA ${candidate.source} ${candidate.firstname} ${candidate.lastname}`);

    const outcome = await processCandidateThroughLca(
      lcaClient,
      candidate,
      identity,
      residenceInsee,
      history,
      job.id,
    );

    console.log(
      `[pass-sport-worker] job ${job.id}: ← LCA ${candidate.source} -> ${outcome.status}`,
    );

    // 'error' means the LCA call itself failed (network, gateway, malformed answer)
    if (outcome.status === "error") {
      throw new Error(
        `[pass-sport-worker] job ${job.id}: LCA call failed for a ${candidate.source} beneficiary — nothing persisted, job will be retried`,
      );
    }

    let passSportCode: string | null = null;

    if (outcome.status === "confirmed") {
      confirmed += 1;
      passSportCode = outcome.passSportCode;
      recipient ??= (outcome.confirm.allocataire as { courriel?: string } | undefined)?.courriel;
    }

    // A confirmed LCA beneficiary IS eligible whatever our own rules concluded: the LCA
    // base is authoritative and the person is walking away with a code.
    const hasCode = passSportCode !== null;
    const isEligible = hasCode || candidate.eligibilities.length > 0;

    // The pass Sport code goes two ways: persisted below so the site can show it, and
    // mailed. The send itself happens once after the loop — here we only decide what this
    // beneficiary contributes to it.
    const emailKind = emailKindFor(hasCode, isEligible);

    digest.push({
      firstname: candidate.firstname,
      lastname: candidate.lastname,
      kind: emailKind,
      code: passSportCode ?? undefined,
    });

    pending.push({
      candidate,
      status: outcome.status,
      isEligible,
      verdict: verdictFor(hasCode, isEligible),
      passSportCode,
      emailKind,
    });
  }

  // Only ever the connected user: an enfant always passes worthAnLcaCall, and a self
  // candidate only exists when AAH or CROUS was claimed. So this is a real refusal on an
  // aide the usager did ask about, never an unexamined case.
  for (const candidate of skipped) {
    pending.push({
      candidate,
      // No LCA call was made for this person, so neither 'not_found' nor 'error' is true.
      status: "not_applicable",
      isEligible: false,
      verdict: "not_eligible",
      passSportCode: null,
      // Left out of the digest on purpose: we do not email someone a refusal for an aide
      // they never claimed, and emailKind drives both the digest and the email_sent UPDATE.
      emailKind: null,
    });
  }

  // PHASE 2 — every external call succeeded: commit the batch, all or nothing.
  const outcomes: BeneficiaryOutcome[] = pending.map((p) => ({
    source: p.candidate.source,
    isEligible: p.isEligible,
    lcaStatus: p.status,
    verdict: p.verdict,
    emailKind: p.emailKind,
    emailSent: false,
  }));

  // The `sub` is not part of the identité pivot and has its own indexed column, so
  // keep it out of the jsonb rather than storing it twice. The commune de résidence goes the
  // other way: FranceConnect never serves it, the usager declared it, and the jsonb is meant
  // to read as the allocataire as declared.
  const { sub: _sub, ...pivot } = identity;
  const allocataireIdentite: AllocataireIdentite = { ...pivot, residence_insee: residenceInsee };

  if (pending.length === 0) {
    // No candidate at all — a QF/AEEH demande whose QF answer carried no exploitable
    // enfant, or an identité pivot missing a given_name or a birthdate. An
    // eligibility_results row is a verdict about a beneficiary, and there is neither, so
    // nothing is written. eligibility_history keeps the trace of the run.
    //
    // The cost is deliberate: applications_by_sub is derived from this table, so this
    // usager is not recognised as having applied and a resubmission re-runs the whole
    // API Particulier chain.
    console.log(`[pass-sport-worker] job ${job.id}: no beneficiary, nothing to record`);
    await history.record({
      actor: "worker",
      action: "results.skipped",
      status: "skipped",
      responsePayload: { rows: 0, reason: "no_beneficiary" },
    });
  } else {
    console.log(
      `[pass-sport-worker] job ${job.id}: inserting ${pending.length} eligibility_results rows in one transaction`,
    );

    // A single transaction: a failure here rolls the whole batch back, so a retry
    // cannot find half a job already written.
    await database.transaction(async (tx) => {
      for (const { candidate, status, isEligible, verdict, passSportCode, emailKind } of pending) {
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
          isEligible,
          isFranceConnected,
          residenceInsee,
          lcaStatus: status,
          verdict,
          passSportCode,
          emailKind,
          // Flipped by the single UPDATE below once the recapitulative email is accepted.
          emailSent: false,
        });
      }
    });

    await history.record({
      actor: "worker",
      action: "results.persisted",
      status: "success",
      responsePayload: { rows: pending.length, reason: "batch" },
    });
  }

  const sent = await sendJobDigest({
    job,
    database,
    history,
    recipient: recipient ?? identity.email,
    entries: digest,
    allocataire: identity,
  });

  const emailed = sent ? digest.length : 0;

  if (sent) {
    for (const o of outcomes) {
      if (o.emailKind) o.emailSent = true;
    }
  }

  console.log(
    `[pass-sport-worker] job ${job.id}: ${results.length} AP calls, ${toProcess.length} beneficiaries (${confirmed} confirmed, ${emailed} emailed)`,
  );
  return {
    beneficiaries: toProcess.length,
    confirmed,
    emailed,
    outcomes,
    apCalls: results.length,
    processedAt: new Date().toISOString(),
  };
}
