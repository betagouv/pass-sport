// Dead-letter queue: where a job lands once its retries are exhausted.
//
// The main queue drops a failed job after removeOnFail (24h) — enough to triage a
// fresh incident, not enough to survive a weekend. Rather than stretching that window
// (which would also keep the user blocked on "en cours de traitement", since the site
// reads the main queue), the final failure is republished here, on a queue nobody
// consumes. It is a visible list of "what still needs a human", separate from the
// working queue, with its own retention.
//
// A replay MUST reuse the original job id: it is the FranceConnect `sub`, which is what
// the site's dedup check reads (site/src/app/services/queue.ts findJobForSub). Replaying
// under a fresh id would let the same person hold two live requests.

import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { EligibilityJobData } from "./eligibility/types";

export const DEAD_LETTER_QUEUE_NAME = "codes-queue-dlq";

// Duplicated from index.ts on purpose: importing index.ts runs main() and boots a whole
// worker, which is exactly what a CLI reading this queue must not do.
export const MAIN_QUEUE_NAME = "codes-queue";

// 7 days. These entries hold an identité pivot in clear, so this is also the retention
// boundary for that personal data — long enough to survive a weekend, not indefinite.
const DEAD_LETTER_RETENTION_MS = 7 * 24 * 3600 * 1000;

// The original payload, plus what a human needs to decide whether to replay it.
export type DeadLetterData = EligibilityJobData & {
  originalJobId: string | null;
  originalJobName: string;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
};

export const createDeadLetterQueue = (connection: Redis): Queue<DeadLetterData> =>
  new Queue<DeadLetterData>(DEAD_LETTER_QUEUE_NAME, { connection });

// Jobs sit here in `wait` forever — no worker consumes this queue, so BullMQ's
// removeOn* never fires. Retention is enforced by sweeping instead.
export const cleanDeadLetter = async (queue: Queue<DeadLetterData>): Promise<number> => {
  const removed = await queue.clean(DEAD_LETTER_RETENTION_MS, 1000, "wait");
  return removed.length;
};

export const toDeadLetter = async (
  queue: Queue<DeadLetterData>,
  job: {
    id?: string;
    name: string;
    data: EligibilityJobData;
    attemptsMade: number;
    failedReason?: string;
  },
  reason: string,
): Promise<void> => {
  await queue.add(
    job.name,
    {
      ...job.data,
      originalJobId: job.id ?? null,
      originalJobName: job.name,
      failedReason: job.failedReason ?? reason,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
    },
    // Same id as the original: a job that somehow reaches here twice collapses into
    // one entry instead of piling up duplicates for the same person.
    { jobId: job.id },
  );
};
