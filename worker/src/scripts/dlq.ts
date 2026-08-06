// Operator CLI for the dead-letter queue.
//
//   pnpm dlq list                 # what is waiting for a human, oldest first
//   pnpm dlq replay <jobId>       # push one back onto the main queue
//   pnpm dlq replay --all         # push everything back
//   pnpm dlq drop <jobId>         # give up on one, remove it
//
// Replays reuse the ORIGINAL job id: it is the FranceConnect `sub`, which is what the
// site's dedup check reads, so a replay under a fresh id would let the same person hold
// two live requests.

import "../load-env";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import {
  DEAD_LETTER_QUEUE_NAME,
  type DeadLetterData,
  MAIN_QUEUE_NAME,
  createDeadLetterQueue,
} from "../dead-letter";
import type { EligibilityJobData } from "../eligibility/types";

const SCALINGO_REDIS_URL =
  process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// BullMQ does NOT own a connection it was handed, so Queue.close() leaves it open and
// the CLI would hang on an idle event loop. Track them and quit them explicitly.
const connections: Redis[] = [];
const connection = (): Redis => {
  const client = new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });
  connections.push(client);
  return client;
};

// Strips the DLQ bookkeeping back off, and drops the checkpoint deliberately: it holds
// API Particulier answers frozen at failure time. Replaying days later against stale
// eligibility data would produce a verdict on a situation that no longer holds, so the
// chain is re-run from scratch.
const payloadFor = (data: DeadLetterData): EligibilityJobData => {
  const {
    originalJobId: _id,
    originalJobName: _name,
    failedReason: _reason,
    failedAt: _at,
    attemptsMade: _attempts,
    checkpoint: _checkpoint,
    ...payload
  } = data;
  return payload;
};

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);
  const dlq = createDeadLetterQueue(connection());
  const mainQueue = new Queue<EligibilityJobData>(MAIN_QUEUE_NAME, { connection: connection() });

  const close = async (): Promise<void> => {
    await dlq.close();
    await mainQueue.close();
    await Promise.all(connections.map((c) => c.quit()));
  };

  const entries = await dlq.getJobs(["wait", "paused", "delayed"]);
  entries.sort((a, b) => (a.data.failedAt < b.data.failedAt ? -1 : 1));

  if (!command || command === "list") {
    if (entries.length === 0) {
      console.log(`${DEAD_LETTER_QUEUE_NAME}: empty`);
    }
    for (const e of entries) {
      console.log(
        `${e.data.failedAt}  ${e.data.originalJobId ?? "?"}  ${e.data.originalJobName}  ` +
          `attempts=${e.data.attemptsMade}  ${e.data.failedReason}`,
      );
    }
    console.log(`\n${entries.length} entrée(s)`);
    await close();
    return;
  }

  if (command === "replay") {
    const targets =
      arg === "--all" ? entries : entries.filter((e) => e.data.originalJobId === arg);
    if (targets.length === 0) {
      console.error(`aucune entrée pour "${arg ?? ""}" — essayez: pnpm dlq list`);
      await close();
      process.exitCode = 1;
      return;
    }
    for (const e of targets) {
      const jobId = e.data.originalJobId ?? undefined;

      // The failed original still occupies that id on the main queue until
      // removeOnFail expires (24h), and BullMQ silently ignores add() for an id that
      // already exists — the replay would report success and do nothing. Clear it
      // first. This also unblocks the user on the site, which reads the main queue.
      if (jobId) {
        const stale = await mainQueue.getJob(jobId);
        if (stale) {
          await stale.remove();
        }
      }

      const job = await mainQueue.add(e.data.originalJobName, payloadFor(e.data), { jobId });
      if (!job.id) {
        console.error(`FAILED to replay ${jobId} — not enqueued`);
        continue;
      }
      await e.remove();
      console.log(`replayed ${job.id}`);
    }
    console.log(`${targets.length} job(s) remis sur ${MAIN_QUEUE_NAME}`);
    await close();
    return;
  }

  if (command === "drop") {
    const target = entries.find((e) => e.data.originalJobId === arg);
    if (!target) {
      console.error(`aucune entrée pour "${arg ?? ""}"`);
      await close();
      process.exitCode = 1;
      return;
    }
    await target.remove();
    console.log(`dropped ${arg}`);
    await close();
    return;
  }

  console.error(`usage: dlq [list|replay <jobId>|replay --all|drop <jobId>]`);
  await close();
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error("[dlq]", err);
  process.exit(1);
});
