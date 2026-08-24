import { Worker } from "bullmq";
import {
  startTimer,
  type HistoryEvent,
  type HistoryRecorder,
  type HistoryStatus,
} from "../db/history";
import { logPii } from "../log";
import type { ResourceResult } from "./types";

export type RateLimitable = { rateLimit(expireTimeMs: number): Promise<void> };

// A 404 is an answer ("pas bénéficiaire"), not a failure — assertApiParticulierCallSuceeded
// lets it through, so the history must not paint it as an error either.
export const resultStatus = (r: ResourceResult): HistoryStatus => {
  if (r.rateLimited) return "rate_limited";
  if (r.success) return "success";
  if (r.httpStatus === 404) return "not_found";
  return "error";
};

export const resourceEvent = (
  r: ResourceResult,
  durationMs: number,
  params?: Record<string, unknown>,
): HistoryEvent => ({
  actor: "api_particulier",
  action: r.resource,
  status: resultStatus(r),
  subject: r.childIndex != null ? "enfant" : "self",
  httpStatus: r.httpStatus,
  durationMs,
  error: r.error,
  bodyPayload: params ?? null,
  responsePayload: {
    data: r.data,
    rate_limit_remaining: r.rateLimitRemaining ?? null,
    rate_limit_reset_ms: r.rateLimitResetMs ?? null,
    retry_after: r.retryAfter ?? null,
  },
});

// Pause the WHOLE worker until the window resets and requeue the job WITHOUT a
// failed attempt. The checkpoint is already persisted, so the retry resumes at the
// next undone call. Used by both the reactive (429) and proactive (remaining==0) paths.
async function pauseAndResume(queue: RateLimitable, resetMs: number): Promise<never> {
  await queue.rateLimit(Math.max(1, Math.round(resetMs)));
  throw Worker.RateLimitError();
}

export function assertApiParticulierCallSuceeded(
  jobId: string | undefined,
  r: ResourceResult,
): void {
  if (r.success || r.httpStatus === 404) {
    return;
  }
  throw new Error(
    `[pass-sport-worker] job ${jobId}: API Particulier gave no verdict on ${r.resource} (httpStatus=${r.httpStatus ?? "none"}) ${r.error ?? ""} — nothing persisted, job will be retried`,
  );
}

// Reactive (429): prefer the precise reset over the coarser Retry-After seconds.
async function handleRateLimit(
  jobId: string | undefined,
  queue: RateLimitable,
  r: ResourceResult,
): Promise<never> {
  const resetMs = r.rateLimitResetMs ?? Math.max(1, Number(r.retryAfter ?? 1)) * 1000;

  console.log(
    `[pass-sport-worker] job ${jobId}: 429 on ${r.resource}, pausing ${Math.round(resetMs / 1000)}s until reset`,
  );

  return pauseAndResume(queue, resetMs);
}

// Proactive: a success reported the window exhausted (remaining==0). Pause now so
// the next call doesn't eat a wasted 429.
async function maybeProactivePause(
  jobId: string | undefined,
  queue: RateLimitable,
  r: ResourceResult,
): Promise<void> {
  if (r.rateLimitRemaining === 0 && r.rateLimitResetMs != null) {
    console.log(
      `[pass-sport-worker] job ${jobId}: proactive pause after ${r.resource}, remaining=0, reset in ${Math.round(r.rateLimitResetMs / 1000)}s`,
    );
    await pauseAndResume(queue, r.rateLimitResetMs);
  }
}

export type ResourceCall = {
  jobId: string | undefined;
  queue: RateLimitable;
  history: HistoryRecorder;
  resource: string;
  subject?: "self" | "enfant";
  logSuffix?: string;
  // Query params as they go on the wire. An identité pivot: the logs only carry it behind
  // LOG_PII, eligibility_history.body_payload keeps it like every other raw payload there.
  // Set only from here, where the call is actually made rather than replayed from the
  // checkpoint.
  params?: Record<string, unknown>;
  invoke: () => Promise<ResourceResult>;
  commit?: (r: ResourceResult) => Promise<void>;
};

export async function callResource(call: ResourceCall): Promise<ResourceResult> {
  const { jobId, queue, history, resource, subject, logSuffix, params, invoke, commit } = call;

  console.log(`[pass-sport-worker] job ${jobId}: → API Particulier ${resource}${logSuffix ?? ""}`);

  if (params !== undefined) {
    logPii(`job ${jobId}: → ${resource}${logSuffix ?? ""} params=${JSON.stringify(params)}`);
  }

  const elapsed = startTimer();
  const r = await invoke();

  // Before handleRateLimit: it throws Worker.RateLimitError(), which would carry off
  // the 429 event — the one most worth having.
  await history.record({
    ...resourceEvent(r, elapsed(), params),
    ...(subject ? { subject } : {}),
  });

  if (r.rateLimited) await handleRateLimit(jobId, queue, r);

  assertApiParticulierCallSuceeded(jobId, r);

  await commit?.(r);
  await maybeProactivePause(jobId, queue, r);

  return r;
}
