import "./load-env";
import "./instrument";
import { type Job, Queue, Worker, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import * as Sentry from "@sentry/node";
import { db, pool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { getClient } from "./eligibility/client";
import type { EligibilityJobData, LcaJobData } from "./eligibility/types";
import { processEligibilityJob, type FranceConnectDeps } from "./jobs/france-connect";
import { processLcaJob, type LcaDeps } from "./jobs/lca";
import { processFcCodeEmailsJob, type FcCodeEmailsJobData } from "./jobs/fc-code-emails";
import {
  FRANCE_CONNECT_QUEUE_NAME,
  FC_CODE_EMAILS_QUEUE_NAME,
  LCA_QUEUE_NAME,
  retryBackoff,
} from "./queues";

// Scalingo injects SCALINGO_REDIS_URL for the Redis addon.
const SCALINGO_REDIS_URL = process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on blocking connections.
function createRedisConnection(): Redis {
  return new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });
}

async function startFlow<TData extends object>(opts: {
  queueName: string;
  process: (job: Job<TData>, queue: Queue<TData>) => Promise<unknown>;
  // lockDuration is the reason this exists: the default 30 s gets a long-running job declared
  // stalled and re-delivered mid-run.
  workerOptions?: Partial<WorkerOptions>;
}): Promise<{ close: () => Promise<void> }> {
  const queue = new Queue<TData>(opts.queueName, { connection: createRedisConnection() });

  // Ensure there is only one worker (and also enforce it on scalingo to only have one
  // worker to avoid race conditions)
  await queue.setGlobalConcurrency(1);

  const worker = new Worker<TData>(opts.queueName, async (job) => opts.process(job, queue), {
    connection: createRedisConnection(),
    settings: { backoffStrategy: retryBackoff },
    ...opts.workerOptions,
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

    // Nowhere else to put it: the job stays in `failed` on this queue for removeOnFail (120 j),
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

  const franceConnect = await startFlow<EligibilityJobData>({
    queueName: FRANCE_CONNECT_QUEUE_NAME,
    process: (job, queue) => {
      const deps: FranceConnectDeps = { apiClient, db, queue };
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

  const fcCodeEmails = await startFlow<FcCodeEmailsJobData>({
    queueName: FC_CODE_EMAILS_QUEUE_NAME,
    process: (job) => processFcCodeEmailsJob(job, job.data, { db }),
    workerOptions: { lockDuration: 10 * 60_000 },
  });

  const flows = [franceConnect, lca, fcCodeEmails];

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
