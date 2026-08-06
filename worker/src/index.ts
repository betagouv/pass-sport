// Must be first: loads .env.local (local dev) before any module reads process.env,
// then initializes Sentry before any other module loads.
import "./load-env";
import "./instrument";
import { type Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { type ApiParticulierClient, getClient } from "./eligibility/client";
import { runEligibilitySequence } from "./eligibility/sequence";
import type { EligibilityJobData, QuotientFamilialData } from "./eligibility/types";
import { type LcaClient, getLcaClient } from "./lca/client";
import { listBeneficiaryCandidates } from "./lca/candidates";
import { processCandidateThroughLca } from "./lca/process";
import { type DigestEntry, sendBeneficiaryDigestEmail } from "./email/notify";
import { and, eq, isNotNull } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { db, pool } from "./db/client";
import { createHistoryRecorder } from "./db/history";
import { runMigrations } from "./db/migrate";
import * as schema from "./db/schema";
import { audit, eligibilityResults } from "./db/schema";
import { logPii } from "./log";
import {
  DEAD_LETTER_QUEUE_NAME,
  cleanDeadLetter,
  createDeadLetterQueue,
  toDeadLetter,
} from "./dead-letter";

// Contract shared with the web producer, kept as a tiny duplicate on purpose (just
// a queue name plus the job data shape).
export const CODES_QUEUE_NAME = "codes-queue";

// Only one job kind: full eligibility for a FranceConnect user (allocataire + QF
// children).
export const CODES_JOB_NAME = "france-connect-job";

// Scalingo injects SCALINGO_REDIS_URL for the Redis addon.
const SCALINGO_REDIS_URL = process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on blocking connections.
function createRedisConnection(): Redis {
  return new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });
}

// Custom backoff behind the producer's `backoff: { type: "linear", delay: 60_000 }`
// (site/src/app/services/queue.ts). Neither bullmq builtin fits: `fixed` is constant
// and `exponential` doubles. bullmq passes attemptsMade already incremented for the
// upcoming retry, so 1 -> 1min, 2 -> 2min, 3 -> 3min; with attempts: 4 the 4th
// failure dead-letters instead of waiting again.
export const linearBackoff = (attemptsMade: number, _type?: string, _err?: Error): number =>
  attemptsMade * 60_000;

// Injected dependencies for the job processor, so tests can supply their own
// containers/mocks instead of the module singletons.
export type WorkerDeps = {
  apiClient: ApiParticulierClient;
  lcaClient: LcaClient;
  db: NodePgDatabase<typeof schema>;
  queue: Queue<EligibilityJobData>;
};

export type Verdict = "eligible_confirmed" | "eligible_pending" | "not_eligible" | "not_assessed";
export type BeneficiaryOutcome = {
  source: string;
  isEligible: boolean;
  lcaStatus: string;
  verdict: Verdict;
  emailKind: "code" | "eligible_soon" | "not_eligible" | null;
  emailSent: boolean;
};

// Processes one eligibility job end-to-end: API Particulier chain -> LCA per
// beneficiary -> transactional email -> one Postgres row per beneficiary.
export async function processEligibilityJob(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  deps: WorkerDeps,
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

  // One recorder for the whole job, threaded into everything that calls outside. Writes
  // land immediately and outside any transaction, so a job that dies in PHASE 1 still
  // leaves its trace. attempt is what separates a retry from a duplicate.
  const history = createHistoryRecorder(database, {
    allocataireFcSub: data.identity.sub ?? null,
    jobId: job.id ?? null,
    attempt: job.attemptsMade,
  });

  // Audit trail: record the originating client IP + job id before any processing.
  // Guarded to the first attempt so 429 retries don't duplicate the row.
  if (job.attemptsMade === 0) {
    await database.insert(audit).values({
      jobId: job.id ?? null,
      jobName: job.name ?? null,
      ipAddress: data.clientIp ?? null,
      userAgent: data.userAgent ?? null,
    });
  }

  const results = await runEligibilitySequence(job, data, apiClient, queue, history);

  // Every child + self (only if AAH/CROUS eligible) is processed.
  const { identity, isFranceConnected, residenceInsee } = data;
  const candidates = listBeneficiaryCandidates(identity, results, data.aides);

  // Why each beneficiary did or did not qualify. `reasons` was computed and thrown
  // away before, which made an is_eligible=false impossible to explain after the fact.
  // The quotient is logged with its runtime type on purpose: householdQfCovers requires
  // a number, so an API answering "650" as a string would silently grant nothing.
  const qfRow = results.find((r) => r.resource.startsWith("dss.quotient_familial") && r.success);

  if (qfRow) {
    const qfPayload = qfRow.data as QuotientFamilialData | null;
    const valeur = qfPayload?.quotient_familial?.valeur;
    // A quotient familial is personal financial data, and `reasons` quotes it alongside
    // each child's age — all of it goes behind LOG_PII, never to the normal stream.
    // The runtime type matters: householdQfCovers requires a number, so an API
    // answering "699" as a string would silently grant nothing.
    logPii(
      `job ${job.id}: quotient familial=${JSON.stringify(valeur)} (${typeof valeur}), route QF ${data.aides.includes("QF") ? "demandée" : "NON demandée"}`,
    );
    // The whole block, in case the figure compared against the threshold is not the one
    // the API actually means by "quotient", plus the payload's shape.
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
    c.source === "enfant" || c.eligibilities.includes("AAH") || c.eligibilities.includes("CROUS");

  const toProcess = candidates.filter(worthAnLcaCall);
  // Not sent to LCA — but still persisted below, otherwise the most common refusal (an
  // allocataire who declared AAH, got turned down, and has children) would leave no row
  // at all and the site would have nothing to show them.
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
    emailKind: "code" | "eligible_soon" | "not_eligible" | null;
  }[] = [];

  for (const candidate of toProcess) {
    console.log(`[pass-sport-worker] job ${job.id}: → LCA ${candidate.source}`);

    logPii(`job ${job.id}: → LCA ${candidate.source} ${candidate.firstname} ${candidate.lastname}`);

    const outcome = await processCandidateThroughLca(
      lcaClient,
      candidate,
      identity,
      results,
      residenceInsee,
      history,
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

    // A confirmed LCA beneficiary IS eligible, whatever our own rules concluded: the LCA
    // base is authoritative and the person is walking away with a code.
    const isEligible = outcome.status === "confirmed" || candidate.eligibilities.length > 0;

    // The pass Sport code goes two ways: persisted below so the site can show it, and
    // mailed. The send itself happens once after the loop — here we only decide what this
    // beneficiary contributes to it.
    let emailKind: "code" | "eligible_soon" | "not_eligible" | null = null;

    if (outcome.status === "confirmed" && outcome.passSportCode) {
      confirmed += 1;
      recipient ??= (outcome.confirm?.allocataire as { courriel?: string } | undefined)?.courriel;
      emailKind = "code";
      digest.push({
        firstname: candidate.firstname,
        lastname: candidate.lastname,
        kind: emailKind,
        code: outcome.passSportCode,
      });
    } else if (outcome.status === "not_found" && isEligible) {
      emailKind = "eligible_soon";
      digest.push({ firstname: candidate.firstname, lastname: candidate.lastname, kind: emailKind });
    } else if (outcome.status === "not_found" && !isEligible) {
      emailKind = "not_eligible";
      digest.push({ firstname: candidate.firstname, lastname: candidate.lastname, kind: emailKind });
    }

    const verdict: Verdict = isEligible
      ? outcome.status === "confirmed" && outcome.passSportCode
        ? "eligible_confirmed"
        : "eligible_pending"
      : "not_eligible";

    pending.push({
      candidate,
      status: outcome.status,
      isEligible,
      verdict,
      // Only a 'confirmed' outcome carries one; the other statuses leave it undefined.
      passSportCode: outcome.passSportCode ?? null,
      emailKind,
    });
  }

  const askedAboutSelf = data.aides.includes("AAH") || data.aides.includes("CROUS");

  for (const candidate of skipped) {
    pending.push({
      candidate,
      // No LCA call was made for this person, so neither 'not_found' nor 'error' is true.
      status: "not_applicable",
      isEligible: false,
      verdict: askedAboutSelf ? "not_eligible" : "not_assessed",
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
  // keep it out of the jsonb rather than storing it twice.
  const { sub: _sub, ...allocataireIdentite } = identity;

  if (pending.length === 0) {
    // No candidate at all — the identité pivot was missing a given_name or a birthdate,
    // so listBeneficiaryCandidates could not even build a 'self'. Still record the
    // application: applications_by_sub is the site's dedup source, and without a row this
    // person could resubmit on every visit and re-burn the API Particulier quota.
    console.log(`[pass-sport-worker] job ${job.id}: no beneficiary, recording the application`);
    await database.insert(eligibilityResults).values({
      jobId: job.id ?? null,
      source: "self",
      allocataireIdentite,
      allocataireFcSub: identity.sub ?? null,
      enfantIdentite: null,
      isEligible: false,
      isFranceConnected,
      residenceInsee,
      // No LCA call was made for this job, so neither 'not_found' nor 'error' is true.
      lcaStatus: "not_applicable",
      verdict: "not_assessed",
      passSportCode: null,
      emailKind: null,
      emailSent: false,
    });

    // After the write, so the event doubles as proof it landed.
    await history.record({
      actor: "worker",
      action: "results.persisted",
      status: "success",
      payload: { rows: 1, reason: "no_beneficiary" },
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
      payload: { rows: pending.length, reason: "batch" },
    });
  }

  let emailed = 0;

  if (digest.length > 0) {
    const to = recipient ?? identity.email;
    // The digest carries names and codes; kept whole, like every other payload here.
    const digestPayload = { to: to ?? null, beneficiaries: digest.length, entries: digest };
    try {
      const r = await sendBeneficiaryDigestEmail(to, digest, identity);
      if (r?.sent) {
        emailed = digest.length;
        // One statement for the whole job. Rows with no emailKind (LCA error, or a
        // confirmed match with no code) are excluded — nothing was mailed for them.
        if (job.id) {
          await database
            .update(eligibilityResults)
            .set({ emailSent: true })
            .where(
              and(eq(eligibilityResults.jobId, job.id), isNotNull(eligibilityResults.emailKind)),
            );
        }
        for (const o of outcomes) {
          if (o.emailKind) o.emailSent = true;
        }
        console.log(
          `[pass-sport-worker] job ${job.id}: sent recap email covering ${digest.length} beneficiaries`,
        );
        logPii(`job ${job.id}: sent recap email to ${to ?? "<no recipient>"}`);
        await history.record({
          actor: "worker",
          action: "email.digest",
          status: "success",
          payload: digestPayload,
        });
      } else {
        console.warn(
          `[pass-sport-worker] job ${job.id}: recap email NOT sent, recipient=${to ? "present" : "missing"}`,
        );
        await history.record({
          actor: "worker",
          action: "email.digest",
          status: "error",
          error: to ? "sender reported not sent" : "no recipient",
          payload: digestPayload,
        });
      }
    } catch (e) {
      console.warn(`[pass-sport-worker] job ${job.id}: email send threw: ${(e as Error).message}`);
      await history.record({
        actor: "worker",
        action: "email.digest",
        status: "error",
        error: (e as Error).message,
        payload: digestPayload,
      });
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

async function main(): Promise<void> {
  await runMigrations(pool);

  const apiClient = await getClient();
  const lcaClient = await getLcaClient();

  const queue = new Queue<EligibilityJobData>(CODES_QUEUE_NAME, {
    connection: createRedisConnection(),
  });

  // Ensure there is only one worker (and also enforce it on scalingo to only have one worker to avoid race conditions)
  await queue.setGlobalConcurrency(1);

  const deadLetterQueue = createDeadLetterQueue(createRedisConnection());
  const sweepDeadLetter = async (): Promise<void> => {
    try {
      const swept = await cleanDeadLetter(deadLetterQueue);
      if (swept > 0) {
        console.log(`[pass-sport-worker] dead-letter: swept ${swept} entries past retention`);
      }
    } catch (e) {
      console.warn(`[pass-sport-worker] dead-letter sweep failed: ${(e as Error).message}`);
    }
  };

  await sweepDeadLetter();

  // Clean DLQ every hour. eligibility_history is NOT swept — it is kept indefinitely.
  const sweepTimer = setInterval(sweepDeadLetter, 3600_000);

  sweepTimer.unref();

  const deps: WorkerDeps = { apiClient, lcaClient, db, queue };

  const worker = new Worker<EligibilityJobData>(
    CODES_QUEUE_NAME,
    async (job) => processEligibilityJob(job, job.data, deps),
    {
      connection: createRedisConnection(),
      settings: { backoffStrategy: linearBackoff },
    },
  );

  worker.on("error", (err) => {
    console.error(`[pass-sport-worker] worker error: ${err.message}`);
    Sentry.captureException(err, { tags: { component: "worker" } });
  });

  queue.on("error", (err) => {
    console.error(`[pass-sport-worker] queue error: ${err.message}`);
    Sentry.captureException(err, { tags: { component: "queue" } });
  });

  worker.on("completed", (job) => {
    console.log(`[pass-sport-worker] job ${job.id} completed`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`[pass-sport-worker] job ${job?.id} failed: ${err.message}`);

    const maxAttempts = job?.opts?.attempts ?? 1;
    if (job && job.attemptsMade >= maxAttempts) {
      try {
        await toDeadLetter(deadLetterQueue, job, err.message);
        console.error(
          `[pass-sport-worker] job ${job.id} exhausted ${maxAttempts} attempts -> ${DEAD_LETTER_QUEUE_NAME}`,
        );
      } catch (e) {
        console.error(
          `[pass-sport-worker] could not dead-letter job ${job.id}: ${(e as Error).message}`,
        );
      }
    }

    Sentry.captureException(err, {
      tags: {
        component: "job",
        jobName: job?.name ?? "unknown",
        jobId: job?.id ?? "unknown",
      },
      extra: { attemptsMade: job?.attemptsMade, failedReason: job?.failedReason },
    });
  });

  console.log("[pass-sport-worker] standalone worker started");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[pass-sport-worker] ${signal} received, closing...`);
    await worker.close();
    await queue.close();
    await deadLetterQueue.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Bootstrap the real worker except under Vitest, whose harness imports this module
// for its exports and must NOT start a worker or bind Redis.
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error("[pass-sport-worker] fatal:", err);
    process.exit(1);
  });
}
