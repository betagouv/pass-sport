import { Worker, type Job, type Queue } from "bullmq";
import { type ApiParticulierClient, RESOURCE_META } from "./client";
import { startTimer, type HistoryEvent, type HistoryRecorder, type HistoryStatus } from "../db/history";
import {
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  ALLOWANCE_RESOURCES,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  RESOURCE_ORDER,
  householdQfCovers,
  isWithinBirthdateWindow,
  type EligibilityCheckpoint,
  type EligibilityJobData,
  type PersonneQuotientFamilial,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceKey,
  type ResourceResult,
} from "./types";

// QF dates come back as "AAAA-MM-JJ" or "JJ/MM/AAAA" — normalize to ISO.
const toIsoBirthdate = (date?: string): string | undefined => {
  if (!date) return undefined;
  const fr = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);

  return undefined;
};

// Synthetic pivot identity for a QF child (reuses the identité param builders).
// Children carry no birth COG — the parent's is used.
const enfantToIdentity = (
  enfant: PersonneQuotientFamilial,
  parent: PivotIdentity,
): PivotIdentity | null => {
  const familyName = enfant.nom_naissance || enfant.nom_usage;
  const birthdate = toIsoBirthdate(enfant.date_naissance);
  if (!familyName || !enfant.prenoms || !birthdate) return null;
  return {
    family_name: familyName,
    preferred_username: enfant.nom_usage || undefined,
    given_name: enfant.prenoms,
    gender: enfant.sexe === "F" ? "female" : enfant.sexe === "M" ? "male" : undefined,
    birthdate,
    birthplace: parent.birthplace,
    birthcountry: parent.birthcountry,
  };
};

// One planned per-child AEEH call. A child is queried only when all three hold:
//   - the QF row yields a usable pivot (name + prénoms + date de naissance);
//   - they are 17-19 ans (AEEH_BIRTHDATE_MIN/MAX) — younger or older children can
//     never be granted AEEH by candidates.ts, so an appel would be pure quota burn;
//   - the household quotient does NOT already cover them. QF has priority: on the
//     overlapping 2009 millésime an eligible household saves the call entirely.
type ChildCheck = { childIndex: number; identity: PivotIdentity };

const planChildrenChecks = (
  enfants: PersonneQuotientFamilial[],
  parent: PivotIdentity,
  qfCovers: boolean,
): ChildCheck[] =>
  enfants.flatMap((enfant, childIndex) => {
    const identity = enfantToIdentity(enfant, parent);
    if (!identity) return [];

    const { birthdate } = identity;
    if (!isWithinBirthdateWindow(birthdate, AEEH_BIRTHDATE_MIN, AEEH_BIRTHDATE_MAX)) return [];
    if (qfCovers && isWithinBirthdateWindow(birthdate, QF_BIRTHDATE_MIN, QF_BIRTHDATE_MAX)) {
      return [];
    }

    return [{ childIndex, identity }];
  });

// A 404 is an answer ("pas bénéficiaire"), not a failure — assertApiParticulierCallSuceeded
// lets it through, so the history must not paint it as an error either.
const resultStatus = (r: ResourceResult): HistoryStatus => {
  if (r.rateLimited) return "rate_limited";
  if (r.success) return "success";
  if (r.httpStatus === 404) return "not_found";
  return "error";
};

const resourceEvent = (r: ResourceResult, durationMs: number): HistoryEvent => ({
  actor: "api_particulier",
  action: r.resource,
  status: resultStatus(r),
  subject: r.childIndex != null ? "enfant" : "self",
  httpStatus: r.httpStatus,
  durationMs,
  error: r.error,
  payload: {
    data: r.data,
    rate_limit_remaining: r.rateLimitRemaining ?? null,
    rate_limit_reset_ms: r.rateLimitResetMs ?? null,
    retry_after: r.retryAfter ?? null,
  },
});

// Pause the WHOLE worker until the window resets and requeue the job WITHOUT a
// failed attempt. The checkpoint is already persisted, so the retry resumes at the
// next undone call. Used by both the reactive (429) and proactive (remaining==0) paths.
async function pauseAndResume(
  job: Job<EligibilityJobData>,
  queue: Queue<EligibilityJobData>,
  resetMs: number,
): Promise<never> {
  await queue.rateLimit(Math.max(1, Math.round(resetMs)));
  throw Worker.RateLimitError();
}

function assertApiParticulierCallSuceeded(job: Job<EligibilityJobData>, r: ResourceResult): void {
  if (r.success || r.httpStatus === 404) {
    return;
  }
  throw new Error(
    `[pass-sport-worker] job ${job.id}: API Particulier gave no verdict on ${r.resource} (httpStatus=${r.httpStatus ?? "none"}) ${r.error ?? ""} — nothing persisted, job will be retried`,
  );
}

// Reactive (429): prefer the precise reset over the coarser Retry-After seconds.
async function handleRateLimit(
  job: Job<EligibilityJobData>,
  queue: Queue<EligibilityJobData>,
  r: ResourceResult,
): Promise<never> {
  const resetMs = r.rateLimitResetMs ?? Math.max(1, Number(r.retryAfter ?? 1)) * 1000;

  console.log(
    `[pass-sport-worker] job ${job.id}: 429 on ${r.resource}, pausing ${Math.round(resetMs / 1000)}s until reset`,
  );

  return pauseAndResume(job, queue, resetMs);
}

// Proactive: a success reported the window exhausted (remaining==0). Pause now so
// the next call doesn't eat a wasted 429.
async function maybeProactivePause(
  job: Job<EligibilityJobData>,
  queue: Queue<EligibilityJobData>,
  r: ResourceResult,
): Promise<void> {
  if (r.rateLimitRemaining === 0 && r.rateLimitResetMs != null) {
    console.log(
      `[pass-sport-worker] job ${job.id}: proactive pause after ${r.resource}, remaining=0, reset in ${Math.round(r.rateLimitResetMs / 1000)}s`,
    );
    await pauseAndResume(job, queue, r.rateLimitResetMs);
  }
}

// Sequential API Particulier chain: QF -> [AAH] -> [CROUS] -> per child: AEEH.
// Sequential on purpose (never Promise.all). Checkpoints after every success so a
// 429-interrupted job resumes instead of re-calling completed resources.
export async function runEligibilitySequence(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  client: ApiParticulierClient,
  queue: Queue<EligibilityJobData>,
  history: HistoryRecorder,
): Promise<ResourceResult[]> {
  const cp: EligibilityCheckpoint = data.checkpoint ?? { done: {}, results: [] };

  const wanted = new Set<ResourceKey>(data.aides.flatMap((a) => ALLOWANCE_RESOURCES[a] ?? []));
  const parentKeys = RESOURCE_ORDER.filter((k) => wanted.has(k));

  const parentCall: Record<ResourceKey, () => Promise<ResourceResult>> = {
    qf: () => client.quotientFamilial(data.identity),
    aah: () => client.aah(data.identity),
    cnous: () => client.cnous(data.identity),
  };

  // Persist the checkpoint on job.data so a retry sees it.
  const commit = async (key: string, r: ResourceResult): Promise<void> => {
    cp.results.push(r);
    cp.done[key] = true;
    await job.updateData({ ...job.data, checkpoint: cp });
  };

  for (const key of parentKeys) {
    if (cp.done[key]) {
      // Recorded rather than skipped silently: on a retry this is what shows the
      // checkpoint did its job, instead of leaving a hole where a call should be.
      await history.record({
        actor: "api_particulier",
        action: RESOURCE_META[key].resource,
        status: "skipped",
        subject: "self",
      });
      continue;
    }
    console.log(
      `[pass-sport-worker] job ${job.id}: → API Particulier ${RESOURCE_META[key].resource}`,
    );
    const elapsed = startTimer();
    const r = await parentCall[key]();

    // Before handleRateLimit: it throws Worker.RateLimitError(), which would carry off
    // the 429 event — the one most worth having.
    await history.record(resourceEvent(r, elapsed()));

    if (r.rateLimited) await handleRateLimit(job, queue, r);

    assertApiParticulierCallSuceeded(job, r);

    await commit(key, r);
    await maybeProactivePause(job, queue, r);
  }

  // Per-child AEEH, fed by the QF response's enfants[].
  if (data.aides.includes("AEEH")) {
    const qf = cp.results.find(
      (r) => r.resource.startsWith("dss.quotient_familial") && r.success && r.data,
    );

    const qfData = qf?.data as QuotientFamilialData | undefined;
    const enfants = qfData?.enfants ?? [];
    const qfCovers = householdQfCovers(data.aides, qfData);

    for (const check of planChildrenChecks(enfants, data.identity, qfCovers)) {
      const ckey = `aeeh:${check.childIndex}`;

      if (cp.done[ckey]) {
        await history.record({
          actor: "api_particulier",
          action: RESOURCE_META.aeeh.resource,
          status: "skipped",
          subject: "enfant",
        });
        continue;
      }

      console.log(
        `[pass-sport-worker] job ${job.id}: → API Particulier ${RESOURCE_META.aeeh.resource} (child ${check.childIndex})`,
      );

      const elapsed = startTimer();
      const r = await client.aeeh(check.identity, check.childIndex);

      await history.record({
        // resourceEvent infers the subject from r.childIndex, which the client does not
        // always echo back — pin it from the plan instead.
        ...resourceEvent(r, elapsed()),
        subject: "enfant",
      });

      if (r.rateLimited) await handleRateLimit(job, queue, r);

      assertApiParticulierCallSuceeded(job, r);

      await commit(ckey, r);
      await maybeProactivePause(job, queue, r);
    }
  }

  return cp.results;
}
