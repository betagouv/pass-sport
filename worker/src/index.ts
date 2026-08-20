// Must be first: loads .env.local (local dev) before any module reads process.env,
// then initializes Sentry before any other module loads.
import "./load-env";
import "./instrument";
import { type Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import * as Sentry from "@sentry/node";
import { db, pool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { getClient } from "./eligibility/client";
import { getLcaClient } from "./lca/client";
import type { EligibilityJobData, LcaJobData } from "./eligibility/types";
import { processEligibilityJob, type FranceConnectDeps } from "./jobs/france-connect";
import { processLcaJob, type LcaDeps } from "./jobs/lca";
import { sweepEmailVerifications } from "./db/email-verifications";
import { FRANCE_CONNECT_QUEUE_NAME, LCA_QUEUE_NAME, retryBackoff } from "./queues";

// Scalingo injects SCALINGO_REDIS_URL for the Redis addon.
const SCALINGO_REDIS_URL = process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on blocking connections.
function createRedisConnection(): Redis {
  return new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });
}

async function startFlow<TData extends object>(opts: {
  queueName: string;
  process: (job: Job<TData>, queue: Queue<TData>) => Promise<unknown>;
}): Promise<{ close: () => Promise<void> }> {
  const queue = new Queue<TData>(opts.queueName, { connection: createRedisConnection() });

  // Ensure there is only one worker (and also enforce it on scalingo to only have one
  // worker to avoid race conditions)
  await queue.setGlobalConcurrency(1);

  const worker = new Worker<TData>(opts.queueName, async (job) => opts.process(job, queue), {
    connection: createRedisConnection(),
    settings: { backoffStrategy: retryBackoff },
  });

  worker.on("error", (err) => {
    console.error(`[pass-sport-worker] ${opts.queueName} worker error: ${err.message}`);
    Sentry.captureException(err, { tags: { component: "worker", queue: opts.queueName } });
  });

  queue.on("error", (err) => {
    console.error(`[pass-sport-worker] ${opts.queueName} queue error: ${err.message}`);
    Sentry.captureException(err, { tags: { component: "queue", queue: opts.queueName } });
  });

  worker.on("completed", (job) => {
    console.log(`[pass-sport-worker] job ${job.id} completed (${opts.queueName})`);
  });

  worker.on("failed", async (job, err) => {
    console.error(`[pass-sport-worker] job ${job?.id} failed: ${err.message}`);

    // Nowhere else to put it: the job stays in `failed` on this queue for removeOnFail (24h),
    // and the Sentry event below is the thing that actually tells anyone. Recovery is the
    // usager resubmitting, which the producer unblocks by clearing this stale entry.
    const maxAttempts = job?.opts?.attempts ?? 1;
    if (job && job.attemptsMade >= maxAttempts) {
      console.error(
        `[pass-sport-worker] job ${job.id} exhausted ${maxAttempts} attempts on ${opts.queueName} — awaiting a resubmission`,
      );
    }

    Sentry.captureException(err, {
      tags: {
        component: "job",
        queue: opts.queueName,
        jobName: job?.name ?? "unknown",
        jobId: job?.id ?? "unknown",
      },
      extra: { attemptsMade: job?.attemptsMade, failedReason: job?.failedReason },
    });
  });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}

async function main(): Promise<void> {
  await runMigrations(pool);

  const apiClient = await getClient();
  const lcaClient = await getLcaClient();

  const franceConnect = await startFlow<EligibilityJobData>({
    queueName: FRANCE_CONNECT_QUEUE_NAME,
    process: (job, queue) => {
      const deps: FranceConnectDeps = { apiClient, lcaClient, db, queue };
      return processEligibilityJob(job, job.data, deps);
    },
  });

  // The no-FranceConnect path answers in the request itself; this only journals the LCA
  // calls the site made, persists the verdict and mails the code.
  const lca = await startFlow<LcaJobData>({
    queueName: LCA_QUEUE_NAME,
    process: (job) => {
      const deps: LcaDeps = { db };
      return processLcaJob(job, job.data, deps);
    },
  });

  const flows = [franceConnect, lca];

  const sweepAll = async (): Promise<void> => {
    try {
      const swept = await sweepEmailVerifications(db);
      if (swept > 0) {
        console.log(`[pass-sport-worker] email_verifications: swept ${swept} rows past retention`);
      }
    } catch (e) {
      console.warn(`[pass-sport-worker] email_verifications sweep failed: ${(e as Error).message}`);
    }
  };

  await sweepAll();

  // Hourly. email_verifications is the only swept table: its payload holds a declared identité
  // pivot left over from the retired verification flow. eligibility_history is NOT swept — it
  // is kept indefinitely.
  const sweepTimer = setInterval(sweepAll, 3600_000);

  sweepTimer.unref();

  console.log("[pass-sport-worker] standalone worker started");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[pass-sport-worker] ${signal} received, closing...`);
    await Promise.all(flows.map((f) => f.close()));
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Bootstrap the real worker except under Vitest, whose harness imports these modules
// for its exports and must NOT start a worker or bind Redis.
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error("[pass-sport-worker] fatal:", err);
    process.exit(1);
  });
}
