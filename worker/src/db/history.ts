import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { eligibilityHistory } from "./schema";

// Who performed the action. 'cron' is emitted from raw SQL by the code write-back under
// data/2026/partners/franceconnect, never through this recorder.
export type HistoryActor = "api_particulier" | "lca" | "worker" | "cron";

export type HistoryStatus = "success" | "not_found" | "error" | "rate_limited" | "skipped";

export type HistoryEvent = {
  actor: HistoryActor;
  action: string;
  status: HistoryStatus;
  subject?: "self" | "enfant";
  httpStatus?: number | null;
  durationMs?: number;
  error?: string;
  // Always an object, never a bare array: call sites wrap collections so the column
  // keeps a queryable shape (`payload->'results'` rather than `payload->0`).
  payload?: Record<string, unknown> | null;
};

export type HistoryContext = {
  allocataireFcSub: string | null;
  jobId: string | null;
  attempt: number;
};

export type HistoryRecorder = {
  record(event: HistoryEvent): Promise<void>;
};

// Escape hatch if the raw-payload decision has to be walked back: keeps the trace
// (actor/action/status/timing) and drops only the response bodies.
const payloadsEnabled = (): boolean => process.env.HISTORY_PAYLOAD !== "0";

// 0 / unset = no cap, which is the default: "full data" was the explicit ask. Kept as a
// volume brake, but nothing here re-fetches — rows are never purged, so a truncation is
// permanent loss. Leave it off unless the table is actually in trouble.
const maxPayloadBytes = (): number => {
  const raw = Number(process.env.HISTORY_MAX_PAYLOAD_BYTES ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
};

function preparePayload(payload: HistoryEvent["payload"]): Record<string, unknown> | null {
  if (payload == null || !payloadsEnabled()) return null;

  const cap = maxPayloadBytes();
  if (cap === 0) return payload;

  // Byte length, not string length: base64 and accented names both make these differ.
  const size = Buffer.byteLength(JSON.stringify(payload), "utf8");
  return size > cap ? { truncated: true, size } : payload;
}

// Elapsed-milliseconds stopwatch. Kept dumber than a wrap-the-call helper on purpose:
// status is derived from the *result* at every call site here, so a wrapper would have
// to take a result->status mapper and read worse than the two lines it replaces.
export const startTimer = (): (() => number) => {
  const t0 = Date.now();
  return () => Date.now() - t0;
};

export function createHistoryRecorder(
  db: NodePgDatabase<typeof schema>,
  ctx: HistoryContext,
): HistoryRecorder {
  return {
    async record(event: HistoryEvent): Promise<void> {
      try {
        // Never `tx`: the trace has to outlive a rolled-back batch or a PHASE 1 throw.
        await db.insert(eligibilityHistory).values({
          allocataireFcSub: ctx.allocataireFcSub,
          jobId: ctx.jobId,
          attempt: ctx.attempt,
          actor: event.actor,
          action: event.action,
          status: event.status,
          subject: event.subject ?? null,
          httpStatus: event.httpStatus ?? null,
          durationMs: event.durationMs ?? null,
          error: event.error ?? null,
          payload: preparePayload(event.payload),
        });
      } catch (e) {
        // An observation table that breaks the pipeline it observes is worse than none.
        console.warn(
          `[pass-sport-worker] history write failed (${event.actor}/${event.action}): ${(e as Error).message}`,
        );
      }
    },
  };
}
