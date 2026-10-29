import "./load-env";
import "./instrument";
import { type Job, Queue, Worker, type WorkerOptions } from "bullmq";
import { Redis } from "ioredis";
import * as Sentry from "@sentry/node";
import { db, pool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { assertEmailTemplatesConfigured } from "./email/notify";
import { getClient } from "./eligibility/client";
import { createRedisRateGate } from "./eligibility/rate-gate";
import type { EligibilityJobData, LcaJobData } from "./eligibility/types";
import { processEligibilityJob, type FranceConnectDeps } from "./jobs/france-connect";
import { processFcRelanceJob } from "./jobs/fc-relance";
import { processLcaJob, type LcaDeps } from "./jobs/lca";
import { processFcCodeEmailsJob, type FcCodeEmailsJobData } from "./jobs/fc-code-emails";
import {
  processFcDnDossierJob,
  type FcDnDossierDeps,
  type FcDnDossierJobData,
} from "./jobs/fc-dn-dossier";
import { createDnClient } from "./demarche-numerique/client";
import { readDnConfig } from "./demarche-numerique/config";
import {
  DN_DOSSIERS_QUEUE_NAME,
  FC_RELANCE_JOB_NAME,
  FRANCE_CONNECT_QUEUE_NAME,
  FC_CODE_EMAILS_QUEUE_NAME,
  LCA_QUEUE_NAME,
  retryBackoff,
} from "./queues";
import { withoutQueryValues } from "./sentry-scrub";

// Scalingo injects SCALINGO_REDIS_URL for the Redis addon.
const SCALINGO_REDIS_URL = process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// BullMQ requires maxRetriesPerRequest: null on blocking connections.
function createRedisConnection(): Redis {
  return new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });
}

// NOT a blocking connection: the gate must fail fast and let the caller pause, where
// maxRetriesPerRequest: null would have it wait indefinitely while holding the job.
function createRateGateConnection(): Redis {
  return new Redis(SCALINGO_REDIS_URL);
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

  // What a job throws is logged, kept in Redis as its failedReason and sent to Sentry.
  const processJob = async (job: Job<TData>) => {
    try {
      return await opts.process(job, queue);
    } catch (e) {
      throw withoutQueryValues(e);
    }
  };

  const worker = new Worker<TData>(opts.queueName, processJob, {
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
  assertEmailTemplatesConfigured();

  await runMigrations(pool);

  const apiClient = await getClient();

  // The ceilings live in Redis and are re-read on every call, so `pnpm apip:rate` retunes a
  // running worker.
  const rateGateConnection = createRateGateConnection();
  const rateGate = createRedisRateGate(rateGateConnection, {
    onLimitsChange: ({ perSecond, perMinute, isNight }) =>
      console.log(
        `[pass-sport-worker] API Particulier cadence: ${perSecond}/s, ${perMinute}/min (${isNight ? "night" : "day"})`,
      ),
  });

  const franceConnect = await startFlow<EligibilityJobData>({
    queueName: FRANCE_CONNECT_QUEUE_NAME,
    process: (job, queue) => {
      const deps: FranceConnectDeps = { apiClient, db, queue, rateGate };
      return job.name === FC_RELANCE_JOB_NAME
        ? processFcRelanceJob(job, job.data, deps)
        : processEligibilityJob(job, job.data, deps);
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

  // Not fatal: the rest of the worker keeps running, and each dossier job fails on its own.
  const dnConfig = readDnConfig();
  if ("error" in dnConfig) {
    console.warn(`[pass-sport-worker] Démarche Numérique disabled: ${dnConfig.error}`);
  } else {
    console.log(
      `[pass-sport-worker] Démarche Numérique: démarche ${dnConfig.config.demarcheNumber} on ${dnConfig.config.baseUrl}`,
    );
  }

  const dnDeps: FcDnDossierDeps =
    "config" in dnConfig
      ? { db, config: dnConfig.config, dn: createDnClient(dnConfig.config) }
      : { db, config: null, dn: null };

  const dnDossiers = await startFlow<FcDnDossierJobData>({
    queueName: DN_DOSSIERS_QUEUE_NAME,
    process: (job) => processFcDnDossierJob(job, job.data, dnDeps),
  });

  const flows = [franceConnect, lca, fcCodeEmails, dnDossiers];

  console.log("[pass-sport-worker] standalone worker started");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[pass-sport-worker] ${signal} received, closing...`);
    await Promise.all(flows.map((f) => f.close()));
    await rateGateConnection.quit();
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
