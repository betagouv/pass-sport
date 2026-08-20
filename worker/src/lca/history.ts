import * as Sentry from "@sentry/node";
import type { HistoryRecorder } from "../db/history";
import type { ConfirmItem, LcaError, SearchItem } from "./types";

// CROUS students often have no address on file — retry with this default INSEE.
export const DEFAULT_INSEE_CODE = "75113";

export const isLcaError = (outcome: unknown): outcome is LcaError =>
  typeof outcome === "object" && outcome !== null && "message" in outcome;

// The only field dropped from the history payload. Not privacy — volume: the attestation
// runs to hundreds of kilobytes per confirm, rows are never purged, and nothing reads it
// back. Everything else (id_psp, matricule, courriel) is kept on purpose.
export const withoutPdf = (item: ConfirmItem): Omit<ConfirmItem, "pdf_base_64"> => {
  const { pdf_base_64: _pdf, ...rest } = item;
  return rest;
};

// A non-2xx is returned rather than thrown, so no catch would otherwise report it.
// NO PII: the message holds a status code, never query params.
const reportGatewayFailure = (action: string, outcome: LcaError): void => {
  if (outcome.httpStatus == null) return;

  Sentry.captureException(new Error(outcome.message), {
    tags: { component: "lca", app: "worker" },
    extra: { action, httpStatus: outcome.httpStatus },
  });
};

type LcaEvent = {
  history: HistoryRecorder;
  action: string;
  subject: "self" | "enfant";
  durationMs: number;
  httpStatus: number;
  extra?: Record<string, unknown>;
};

export const recordLcaSearch = async (
  event: LcaEvent,
  outcome: SearchItem[] | LcaError,
): Promise<void> => {
  const failed = isLcaError(outcome);

  if (failed) reportGatewayFailure(event.action, outcome);

  await event.history.record({
    actor: "lca",
    action: event.action,
    status: failed ? "error" : outcome.length === 0 ? "not_found" : "success",
    subject: event.subject,
    durationMs: event.durationMs,
    httpStatus: event.httpStatus,
    error: failed ? outcome.message : undefined,
    payload: {
      results: failed ? null : outcome,
      result_count: failed ? null : outcome.length,
      ...event.extra,
    },
  });
};

export const recordLcaConfirm = async (
  event: LcaEvent,
  outcome: ConfirmItem[] | LcaError,
): Promise<void> => {
  const failed = isLcaError(outcome);

  if (failed) reportGatewayFailure(event.action, outcome);

  await event.history.record({
    actor: "lca",
    action: event.action,
    status: failed ? "error" : outcome.length === 0 ? "not_found" : "success",
    subject: event.subject,
    durationMs: event.durationMs,
    httpStatus: event.httpStatus,
    error: failed ? outcome.message : undefined,
    payload: {
      // A confirm answers about exactly one beneficiary, so the item is stored as an
      // object rather than an array — `payload->'item'->>'id_psp'` stays queryable.
      item: failed || outcome.length === 0 ? null : withoutPdf(outcome[0]),
      item_count: failed ? null : outcome.length,
      ...event.extra,
    },
  });
};
