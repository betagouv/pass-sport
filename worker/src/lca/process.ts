import * as Sentry from "@sentry/node";
import type { PivotIdentity } from "../eligibility/types";
import { startTimer, type HistoryRecorder } from "../db/history";
import type { LcaClient } from "./client";
import { buildConfirmQuery } from "./client";
import { buildConfirmPayload, buildSearchPayload } from "./candidates";
import {
  DEFAULT_INSEE_CODE,
  isLcaError,
  recordLcaConfirm,
  recordLcaSearch,
  withoutPdf,
} from "./history";
import { logPii } from "../log";
import type { BeneficiaryCandidate, CandidateResult, ConfirmItem } from "./types";

// Strip the matricule (server-side secret) from a confirm item before storage.
const sanitize = (item: ConfirmItem): ConfirmItem => {
  if (item.allocataire && typeof item.allocataire === "object") {
    const {matricule, ...rest} = item.allocataire as Record<string, unknown>;
    return {...item, allocataire: rest};
  }
  return item;
};

export async function processCandidateThroughLca(
  lca: LcaClient,
  candidate: BeneficiaryCandidate,
  identity: PivotIdentity,
  residenceInsee: string,
  history: HistoryRecorder,
  jobId?: string,
): Promise<CandidateResult> {
  const subject = candidate.source;

  try {
    const payload = buildSearchPayload(candidate, residenceInsee);
    const searchTimer = startTimer();
    let { body: search, httpStatus: searchStatus } = await lca.search(payload);
    await recordLcaSearch(
      { history, action: "lca.search", subject, durationMs: searchTimer(), httpStatus: searchStatus, extra: { is_from_crous: !!payload.isFromCrous } },
      search,
    );

    if (!isLcaError(search) && search.length === 0 && payload.isFromCrous) {
      const retryTimer = startTimer();
      ({ body: search, httpStatus: searchStatus } = await lca.search({
        ...payload,
        recipientResidencePlace: DEFAULT_INSEE_CODE,
      }));
      await recordLcaSearch(
        { history, action: "lca.search.crous_retry", subject, durationMs: retryTimer(), httpStatus: searchStatus, extra: { insee_fallback: DEFAULT_INSEE_CODE } },
        search,
      );
    }

    if (isLcaError(search)) return { candidate, status: "error" };
    if (search.length === 0) return { candidate, status: "not_found" };

    const confirmPayload = buildConfirmPayload(search[0], identity);

    // Query as it goes on the wire, matricule included — behind LOG_PII, like the
    // API Particulier params in eligibility/calls.ts.
    logPii(
      `job ${jobId}: → LCA confirm ${subject} params=${buildConfirmQuery(confirmPayload).toString()}`,
    );

    const confirmTimer = startTimer();
    const { body: confirm, httpStatus: confirmStatus } = await lca.confirm(confirmPayload, search[0]);

    logPii(
      `job ${jobId}: ← LCA confirm ${subject} ${
        isLcaError(confirm)
          ? `error=${confirm.message}`
          : JSON.stringify(confirm.map(withoutPdf))
      }`,
    );

    await recordLcaConfirm(
      { history, action: "lca.confirm", subject, durationMs: confirmTimer(), httpStatus: confirmStatus },
      confirm,
    );

    if (isLcaError(confirm)) return { candidate, status: "error" };
    if (confirm.length === 0) return { candidate, status: "not_found" };

    const item = sanitize(confirm[0]);

    if (!item.id_psp) return { candidate, status: "not_found" };

    return { candidate, status: "confirmed", passSportCode: item.id_psp, confirm: item };
  } catch (e) {
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
