import type { Job } from "bullmq";
import type { Database } from "../db/client";
import { createHistoryRecorder, type HistoryRecorder } from "../db/history";
import { audit } from "../db/schema";

export async function startJob(
  job: Job<unknown>,
  database: Database,
  allocataireFcSub: string | null,
  client: { clientIp?: string | null; userAgent?: string | null },
): Promise<HistoryRecorder> {
  const history = createHistoryRecorder(database, {
    allocataireFcSub,
    jobId: job.id ?? null,
    attempt: job.attemptsMade,
  });

  if (job.attemptsMade === 0) {
    await database.insert(audit).values({
      jobId: job.id ?? null,
      jobName: job.name ?? null,
      ipAddress: client.clientIp ?? null,
      userAgent: client.userAgent ?? null,
    });
  }

  return history;
}
