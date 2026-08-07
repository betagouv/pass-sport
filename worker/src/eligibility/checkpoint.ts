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
  params?: unknown;
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
  const checkpoint: EligibilityCheckpoint = job.data.checkpoint ?? { done: {}, results: [] };

  const run = async (call: CheckpointedCall): Promise<ResourceResult | undefined> => {
    // childIndex is part of the identity of a row: AEEH answers for several children all
    // carry the same `resource`, so matching on that alone would replay the wrong one.
    const cached = checkpoint.done[call.key]
      ? checkpoint.results.find(
          (r) => r.resource === call.resource && r.childIndex === call.childIndex,
        )
      : undefined;

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
        checkpoint.results.push(r);
        checkpoint.done[call.key] = true;
        await job.updateData({ ...job.data, checkpoint });
      },
    });
  };

  return { results: checkpoint.results, run };
}
