// Enqueues eligible_pending_lca_checks and exits. The pass itself runs on the worker
// (jobs/lca-checks.ts), where the Postgres pool, Sentry and the history recorder already live.
//
//   pnpm lca:checks:enqueue
//   pnpm lca:checks:enqueue --dry-run --limit 5

import "../load-env";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { LCA_CHECKS_JOB_ID, LCA_CHECKS_JOB_NAME, LCA_CHECKS_QUEUE_NAME } from "../queues";
import type { LcaChecksJobData } from "../jobs/lca-checks";

// LCA_CHECKS_REDIS_URL is what run-lca-checks.sh sets to the tunnel-rewritten URL, so the same
// script serves the processing machine and a Scalingo container alike.
const REDIS_URL =
  process.env.LCA_CHECKS_REDIS_URL ?? process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

const readLimit = (argv: string[]): number | undefined => {
  const index = argv.indexOf("--limit");

  if (index === -1) return undefined;

  const parsed = Number(argv[index + 1]);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--limit expects a positive integer, got "${argv[index + 1]}"`);
  }

  return parsed;
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limit = readLimit(argv);

  // BullMQ requires maxRetriesPerRequest: null on blocking connections.
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<LcaChecksJobData>(LCA_CHECKS_QUEUE_NAME, { connection });

  try {
    const existing = await queue.getJob(LCA_CHECKS_JOB_ID);

    if (existing) {
      const state = await existing.getState();

      // Same reason as clearIfDead in site/src/app/services/queue.ts: BullMQ silently ignores an
      // add() on a taken id, so a corpse in `failed` would mute the cron for good.
      if (state === "failed") {
        await existing.remove();
        console.log(`[pass-sport-worker] cleared a failed ${LCA_CHECKS_JOB_ID}`);
      } else {
        // Exit 0, not an error: the nominal case of a cron firing while the previous pass runs.
        console.log(`[pass-sport-worker] ${LCA_CHECKS_JOB_ID} is already ${state} — nothing to do`);
        return;
      }
    }

    const job = await queue.add(
      LCA_CHECKS_JOB_NAME,
      {
        enqueuedAt: new Date().toISOString(),
        reason: dryRun || limit != null ? "manual" : "cron",
        ...(dryRun ? { dryRun } : {}),
        ...(limit != null ? { limit } : {}),
      },
      {
        jobId: LCA_CHECKS_JOB_ID,
        // A pass re-selects the due rows from scratch, so the next cron firing IS the retry.
        attempts: 1,
        // MUST stay true: the id is constant, and keeping it taken after completion would mute the
        // cron for good. A pass's counters live in eligibility_history, not in a retained job.
        removeOnComplete: true,
        removeOnFail: { age: 30 * 86_400 },
      },
    );

    console.log(
      `[pass-sport-worker] enqueued ${LCA_CHECKS_JOB_NAME} (${job.id})${dryRun ? " dry-run" : ""}${limit != null ? ` limit=${limit}` : ""}`,
    );
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[pass-sport-worker] enqueue-lca-checks failed:", err);
  process.exit(1);
});
