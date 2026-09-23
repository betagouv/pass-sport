import { Worker } from "bullmq";
import * as Sentry from "@sentry/node";
import {
  startTimer,
  type HistoryEvent,
  type HistoryRecorder,
  type HistoryStatus,
} from "../db/history";
import { logPii } from "../log";
import type { ApiParticulierRateGate, RateSlot } from "./rate-gate";
import type { ResourceResult } from "./types";

export type RateLimitable = { rateLimit(expireTimeMs: number): Promise<void> };

// The SDK's ValidationError: API Particulier rejected our params.
export const API_PARTICULIER_VALIDATION_STATUS = 422;

// Same JSON:API code as qf-batch's PROVIDER_DATA_ERROR_CODE: a 5xx carrying errors[0].code
// "35000" is the data provider (CNAF/MSA) choking on this identity. Retried like any 5xx, but
// labelled apart in the history.
export const API_PARTICULIER_PROVIDER_DATA_ERROR_CODE = "35000";

const isParamsRejected = (r: ResourceResult): boolean =>
  r.httpStatus === API_PARTICULIER_VALIDATION_STATUS;

const isProviderDataError = (r: ResourceResult): boolean =>
  r.httpStatus != null &&
  r.httpStatus >= 500 &&
  r.errorCode === API_PARTICULIER_PROVIDER_DATA_ERROR_CODE;

// Params already refused stay refused. The chain pronounces without that resource rather than
// burning the job's four attempts over 24h to hear the same thing. Same params only: sequence.ts
// still re-asks AEEH once on another pays de naissance after a 422.
export const retryingWouldChangeNothing = (r: ResourceResult): boolean => isParamsRejected(r);

// A 404 is an answer ("pas bénéficiaire"), a 422 a question that cannot be asked, a 5xx/35000 a
// question the provider could not answer about this person this time. None is a failure of ours,
// so the history must not paint them as errors — and they must stay distinct.
export const resultStatus = (r: ResourceResult): HistoryStatus => {
  if (r.rateLimited) return "rate_limited";
  if (r.success) return "success";
  if (r.httpStatus === 404) return "not_found";
  if (isParamsRejected(r)) return "invalid_request";
  if (isProviderDataError(r)) return "provider_error";
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
    // The JSON:API error verbatim, code included. Without it a failed row carries a flattened
    // message and nothing to tell a 35000 from any other 5xx, or to name the provider that
    // dropped it (api_error.meta.provider). Same role as qf-batch's qf_error_details.
    error_code: r.errorCode ?? null,
    api_error: r.apiError ?? null,
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

export function assertApiParticulierAnswered(jobId: string | undefined, r: ResourceResult): void {
  if (r.success || r.httpStatus === 404 || retryingWouldChangeNothing(r)) {
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

// Short, and without a failed attempt: a Redis blip must not cost the job its 2h backoff.
const RATE_GATE_UNAVAILABLE_PAUSE_MS = 10_000;

async function takeRateSlot(
  jobId: string | undefined,
  gate: ApiParticulierRateGate,
  resource: string,
): Promise<RateSlot | null> {
  try {
    return await gate.take();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[pass-sport-worker] job ${jobId}: rate gate unavailable before ${resource} (${message}), pausing ${RATE_GATE_UNAVAILABLE_PAUSE_MS / 1000}s`,
    );
    Sentry.captureException(e, { tags: { component: "rate_gate", resource } });
    return null;
  }
}

type RefusedSlot = Extract<RateSlot, { allowed: false }>;

// Proactive: pause until the blocking window rolls over, BEFORE any call goes out.
async function pauseUntilRateWindowResets(
  jobId: string | undefined,
  queue: RateLimitable,
  history: HistoryRecorder,
  resource: string,
  slot: RefusedSlot,
): Promise<never> {
  console.log(
    `[pass-sport-worker] job ${jobId}: rate gate full on ${resource} (${slot.blockedBy} window, ${slot.perSecond}/s, ${slot.perMinute}/min${slot.isNight ? ", night" : ""}), pausing ${slot.retryInMs}ms`,
  );

  // Recorded BEFORE the pause throws, for the same reason as the 429 event below: otherwise
  // the pause carries off the one row that explains the delay.
  await history.record({
    actor: "worker",
    action: "rate_gate",
    status: "rate_limited",
    responsePayload: {
      resource,
      blocked_by: slot.blockedBy,
      limit_per_second: slot.perSecond,
      limit_per_minute: slot.perMinute,
      is_night: slot.isNight,
      retry_after_ms: slot.retryInMs,
    },
  });

  return pauseAndResume(queue, slot.retryInMs);
}

export type ResourceCall = {
  jobId: string | undefined;
  queue: RateLimitable;
  history: HistoryRecorder;
  rateGate: ApiParticulierRateGate;
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
  const { jobId, queue, history, rateGate, resource, subject, logSuffix, params, invoke, commit } =
    call;

  // Before the call and before its log line: a paused job never reached the API. A gate that
  // could not answer at all pauses too — a burst sent blind is what the ceiling exists to prevent.
  const slot = await takeRateSlot(jobId, rateGate, resource);

  if (slot === null) return pauseAndResume(queue, RATE_GATE_UNAVAILABLE_PAUSE_MS);
  if (!slot.allowed) return pauseUntilRateWindowResets(jobId, queue, history, resource, slot);

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

  assertApiParticulierAnswered(jobId, r);

  // These no longer fail the job, so this is the only thing that raises them at read time.
  if (retryingWouldChangeNothing(r)) {
    console.warn(
      `[pass-sport-worker] job ${jobId}: ${resource} gave no answer (httpStatus=${r.httpStatus ?? "none"}, code=${r.errorCode ?? "none"}), pronouncing without it — ${r.error ?? ""}`,
    );
  }

  await commit?.(r);
  await maybeProactivePause(jobId, queue, r);

  return r;
}
