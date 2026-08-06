import * as Sentry from "@sentry/node";
import type { PivotIdentity, ResourceResult } from "../eligibility/types";
import { startTimer, type HistoryRecorder } from "../db/history";
import type { LcaClient } from "./client";
import { buildConfirmPayload, buildSearchPayload } from "./candidates";
import type {
  BeneficiaryCandidate,
  CandidateResult,
  ConfirmItem,
  LcaError,
  SearchItem,
} from "./types";

// CROUS students often have no address on file — retry search with this default INSEE.
const DEFAULT_INSEE_CODE = "75113";

// Strip the matricule (server-side secret) from a confirm item before storage.
const sanitize = (item: ConfirmItem): ConfirmItem => {
  if (item.allocataire && typeof item.allocataire === "object") {
    const {matricule, ...rest} = item.allocataire as Record<string, unknown>;
    return {...item, allocataire: rest};
  }
  return item;
};

// The only field dropped from the history payload. Not privacy — volume: the attestation
// runs to hundreds of kilobytes per confirm, rows are never purged, and nothing reads it
// back. Everything else (id_psp, matricule, courriel) is kept on purpose.
const withoutPdf = (item: ConfirmItem): ConfirmItem => {
  const { pdf_base_64, ...rest } = item;
  return rest;
};

// Runs one candidate through LCA: search -> (CROUS retry) -> confirm(first result).
// Per-candidate try/catch so one failure never aborts the batch. Returns the outcome
// + pass Sport code when confirmed.
//
// Every call is mirrored into eligibility_history with its raw response, including the
// fields sanitize() strips below — the history is the replayable record, the return
// value is not.
export async function processCandidateThroughLca(
  lca: LcaClient,
  candidate: BeneficiaryCandidate,
  identity: PivotIdentity,
  results: ResourceResult[],
  residenceInsee: string,
  history: HistoryRecorder,
): Promise<CandidateResult> {
  const recordSearch = async (
    action: "lca.search" | "lca.search.crous_retry",
    outcome: SearchItem[] | LcaError,
    durationMs: number,
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    const failed = "message" in outcome;
    await history.record({
      actor: "lca",
      action,
      status: failed ? "error" : outcome.length === 0 ? "not_found" : "success",
      subject: candidate.source,
      durationMs,
      error: failed ? outcome.message : undefined,
      payload: { results: failed ? null : outcome, result_count: failed ? null : outcome.length, ...extra },
    });
  };

  try {
    const payload = buildSearchPayload(candidate, residenceInsee);
    const searchTimer = startTimer();
    let search = await lca.search(payload);
    await recordSearch("lca.search", search, searchTimer(), { is_from_crous: !!payload.isFromCrous });

    if (!("message" in search) && search.length === 0 && payload.isFromCrous) {
      const retryTimer = startTimer();
      search = await lca.search({ ...payload, recipientResidencePlace: DEFAULT_INSEE_CODE });
      await recordSearch("lca.search.crous_retry", search, retryTimer(), {
        insee_fallback: DEFAULT_INSEE_CODE,
      });
    }

    if ("message" in search) return { candidate, status: "error" };
    if (search.length === 0) return { candidate, status: "not_found" };

    // Confirm the first result: the search payload already carries the full verified
    // identity, so extra matches are duplicate records for the same person.
    const confirmTimer = startTimer();
    const confirm = await lca.confirm(buildConfirmPayload(search[0], identity, results), search[0]);
    const confirmMs = confirmTimer();

    if (!Array.isArray(confirm) || confirm.length === 0) {
      await history.record({
        actor: "lca",
        action: "lca.confirm",
        status: "error",
        subject: candidate.source,
        durationMs: confirmMs,
        error: "confirm returned no item",
        payload: { response: confirm ?? null },
      });
      return { candidate, status: "error" };
    }

    // Recorded raw apart from the PDF, deliberately: id_psp is what makes a case
    // replayable, and sanitize() below is about the return value, not about this table.
    await history.record({
      actor: "lca",
      action: "lca.confirm",
      status: "success",
      subject: candidate.source,
      durationMs: confirmMs,
      payload: { item: withoutPdf(confirm[0]) },
    });

    const item = sanitize(confirm[0]);
    return { candidate, status: "confirmed", passSportCode: item.id_psp, confirm: item };
  } catch (e) {
    // One failing beneficiary must not abort the rest of the batch, but an LCA call
    // that threw (network error / non-2xx from the Gravitee gateway) is a real
    // incident — report it to Sentry. NO candidate/PII in the payload: the thrown
    // errors carry only a status code or "fetch failed", never query params.
    Sentry.captureException(e, { tags: { component: "lca", app: "worker" } });
    await history.record({
      actor: "lca",
      action: "lca.call",
      status: "error",
      subject: candidate.source,
      error: (e as Error).message,
    });
    return { candidate, status: "error" };
  }
}
