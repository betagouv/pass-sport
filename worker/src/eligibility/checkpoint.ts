import type { Job } from "bullmq";
import { callResource, type RateLimitable } from "./calls";
import type { HistoryRecorder } from "../db/history";
import type { EligibilityCheckpoint, ResourceResult } from "./types";

type CheckpointedJob = { checkpoint?: EligibilityCheckpoint };

type CheckpointedCall = {
  key: string;
  resource: string;
  subject: "self" | "enfant";
  childIndex?: number;
  params?: Record<string, unknown>;
  invoke: () => Promise<ResourceResult>;
};

// One API Particulier call per key, at most once across every attempt of a job: the
// checkpoint lives on job.data, so a job requeued by a 429 pause resumes at the first
// undone call instead of re-billing the ones that already answered.
export function createCheckpointRunner<TData extends CheckpointedJob>(
  job: Job<TData>,
  queue: RateLimitable,
  history: HistoryRecorder,
): {
  results: ResourceResult[];
  run: (call: CheckpointedCall) => Promise<ResourceResult | undefined>;
} {
  const checkpoint: EligibilityCheckpoint = job.data.checkpoint ?? { results: [] };

  const run = async (call: CheckpointedCall): Promise<ResourceResult | undefined> => {
    // Matched on the key alone: several rows share one `resource` — one per swept quotient
    // month, one per child on AEEH — so anything coarser replays the wrong answer.
    const cached = checkpoint.results.find((r) => r.checkpointKey === call.key);

    if (cached) {
      // Recorded rather than skipped silently: on a retry this is what shows the
      // checkpoint did its job, instead of leaving a hole where a call should be.
      await history.record({
        actor: "api_particulier",
        action: call.resource,
        status: "skipped",
        subject: call.subject,
      });
      return cached;
    }

    return callResource({
      jobId: job.id,
      queue,
      history,
      resource: call.resource,
      subject: call.subject,
      logSuffix: call.childIndex != null ? ` (child ${call.childIndex})` : undefined,
      params: call.params,
      invoke: call.invoke,
      commit: async (r) => {
        checkpoint.results.push({ ...r, checkpointKey: call.key });
        await job.updateData({ ...job.data, checkpoint });
      },
    });
  };

  return { results: checkpoint.results, run };
}
