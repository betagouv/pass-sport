import type { Job } from "bullmq";
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import type { Database } from "../db/client";
import { createHistoryRecorder, startTimer, type HistoryRecorder } from "../db/history";
import { eligibilityResults } from "../db/schema";
import { recordEmailDelivery, sendOutcomeEmail } from "../email/notify";
import { buildConfirmQuery, buildSearchQuery, type LcaClient } from "../lca/client";
import { recordLcaConfirm, recordLcaSearch } from "../lca/history";
import { pendingCheckInseeCode } from "../lca/insee";
import { logPii } from "../log";
import {
  decideEmailKind,
  type FcCodeEmailRow,
  rowSubject as codeEmailRowSubject,
  rowToEmailVariables,
} from "./fc-code-emails-rows";
import {
  decideConfirmOutcome,
  decideSearchOutcome,
  rowSubject,
  rowToConfirmPayload,
  rowToSearchPayload,
  type PendingLcaRow,
  type RowOutcome,
} from "./lca-checks-rows";
import { startJob } from "./shared";

export type LcaChecksJobData = {
  enqueuedAt: string;
  reason?: "cron" | "manual";
  dryRun?: boolean;
  limit?: number;
};

// getLca rather than an LcaClient: a worker missing the LCA credentials still has to boot and
// serve the two flows that never call LCA.
export type LcaChecksDeps = { db: Database; getLca: () => Promise<LcaClient> };

const positiveNumberFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const cooldownMinutes = (): number => {
  const parsed = Number(process.env.LCA_CHECKS_COOLDOWN_MIN);
  // 0 defeats the cooldown and is a legitimate setting, so not positiveNumberFromEnv.
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
};

const maxAttempts = (): number => positiveNumberFromEnv("LCA_CHECKS_MAX_ATTEMPTS", 200);

// Kept under the cron interval so a pass never overruns into the next one.
const maxDurationMs = (): number =>
  positiveNumberFromEnv("LCA_CHECKS_MAX_DURATION_MIN", 20) * 60_000;

const maxCandidates = (): number => positiveNumberFromEnv("LCA_CHECKS_MAX_CANDIDATES", 3);

// Deliberately tighter than the LCA ceiling: a code mail that has failed three times is failing on
// something a fourth send will not change, and every attempt costs a real recipient a risk of
// duplicate.
const maxEmailAttempts = (): number => positiveNumberFromEnv("FC_CODE_EMAIL_MAX_ATTEMPTS", 3);

const emailCooldownMinutes = (): number => {
  const parsed = Number(process.env.FC_CODE_EMAIL_COOLDOWN_MIN);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
};

// How far out the code mail is programmed on Link Mobility. 0 sends it on the spot.
const emailDelayMinutes = (): number => {
  const parsed = Number(process.env.FC_CODE_EMAIL_DELAY_MIN);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30;
};

const isDryRun = (data: LcaChecksJobData): boolean =>
  data.dryRun ?? process.env.LCA_CHECKS_DRY_RUN === "1";

type Counters = {
  processed: number;
  confirmed: number;
  stillPending: number;
  mismatches: number;
  errors: number;
  skipped: number;
  mailed: number;
  mailSkipped: number;
  mailFailed: number;
  mailTerminal: number;
};

const isDueForCheck = (cooldownMin: number, attemptCeiling: number) =>
  and(
    eq(eligibilityResults.verdict, "eligible_pending_lca"),
    isNotNull(eligibilityResults.passSportCode),
    lt(eligibilityResults.lcaCheckAttempts, attemptCeiling),
    // updated_at doubles as "last attempted at": migration 0006 installed a BEFORE UPDATE
    // trigger, so recording an attempt dates the row on its own.
    or(
      eq(eligibilityResults.lcaCheckAttempts, 0),
      lt(eligibilityResults.updatedAt, sql`now() - make_interval(mins => ${cooldownMin})`),
    ),
  );

// No LIMIT: a pass takes every due row. `limit` exists for an essai à blanc only.
const selectDueRows = async (
  database: Database,
  cooldownMin: number,
  attemptCeiling: number,
  limit?: number,
): Promise<PendingLcaRow[]> => {
  const query = database
    .select({
      id: eligibilityResults.id,
      source: eligibilityResults.source,
      allocataireIdentite: eligibilityResults.allocataireIdentite,
      enfantIdentite: eligibilityResults.enfantIdentite,
      passSportCode: eligibilityResults.passSportCode,
      allocataireFcSub: eligibilityResults.allocataireFcSub,
      lcaCheckAttempts: eligibilityResults.lcaCheckAttempts,
    })
    .from(eligibilityResults)
    .where(isDueForCheck(cooldownMin, attemptCeiling))
    // Anti-starvation: whenever the deadline cuts a pass short, the next one resumes with the
    // rows it did not reach.
    .orderBy(asc(eligibilityResults.lcaCheckAttempts), asc(eligibilityResults.updatedAt));

  return limit != null ? query.limit(limit) : query;
};

/**
 * Asks LCA about one row. Never throws: a single unreachable gateway must not discard the rows a
 * pass has already settled, so every failure comes back as an outcome.
 */
async function checkRow(
  lca: LcaClient,
  row: PendingLcaRow,
  history: HistoryRecorder,
  jobId?: string,
): Promise<RowOutcome> {
  const subject = rowSubject(row);
  const storedCode = row.passSportCode ?? "";
  const searchPayload = rowToSearchPayload(row);

  if (!searchPayload) return { kind: "unprocessable", reason: "missing_identity" };

  logPii(
    `job ${jobId}: → LCA search ${subject} ${row.id} params=${buildSearchQuery(searchPayload).toString()}`,
  );

  const searchTimer = startTimer();
  const search = await lca.search(searchPayload);

  await recordLcaSearch(
    {
      history,
      action: "lca.pending_check.search",
      subject,
      durationMs: searchTimer(),
      httpStatus: search.httpStatus,
      bodyPayload: searchPayload,
      extra: {
        eligibility_result_id: row.id,
        insee_code_used: searchPayload.recipientResidencePlace,
      },
    },
    search.body,
  );

  const searched = decideSearchOutcome(search.body);

  if (searched.kind !== "candidates") return searched;

  const candidates = searched.items.slice(0, maxCandidates());
  const mismatchedCodes: string[] = [];
  let lastFailure: RowOutcome | null = null;

  for (const [candidateIndex, item] of candidates.entries()) {
    const confirmPayload = rowToConfirmPayload(row, item);

    logPii(
      `job ${jobId}: → LCA confirm ${subject} ${row.id} candidat ${candidateIndex} params=${buildConfirmQuery(confirmPayload).toString()}`,
    );

    const confirmTimer = startTimer();
    const confirm = await lca.confirm(confirmPayload, item);

    await recordLcaConfirm(
      {
        history,
        action: "lca.pending_check.confirm",
        subject,
        durationMs: confirmTimer(),
        httpStatus: confirm.httpStatus,
        bodyPayload: confirmPayload,
        extra: {
          eligibility_result_id: row.id,
          stored_code: storedCode,
          candidate_index: candidateIndex,
          result_count: searched.items.length,
        },
      },
      confirm.body,
    );

    const decided = decideConfirmOutcome(storedCode, confirm.body);

    if (decided.kind === "match") {
      return { kind: "confirmed", passSportCode: storedCode, candidateIndex };
    }

    if (decided.kind === "other_code") {
      mismatchedCodes.push(decided.code);
      continue;
    }

    lastFailure = decided;
  }

  if (mismatchedCodes.length > 0) return { kind: "code_mismatch", lcaCodes: mismatchedCodes };

  return lastFailure ?? { kind: "still_pending", stage: "confirm" };
}

/**
 * Guarded on the verdict, so a replay, a stalled-job re-delivery or a race is a no-op — same role
 * as `and r.verdict = 'eligible_pending'` in writeback_verdict.sql. pass_sport_code is not
 * rewritten: it is the value that was just verified.
 */
async function markConfirmed(database: Database, row: PendingLcaRow): Promise<boolean> {
  const updated = await database
    .update(eligibilityResults)
    .set({ verdict: "eligible_confirmed", lcaStatus: "confirmed" })
    .where(
      and(
        eq(eligibilityResults.id, row.id),
        eq(eligibilityResults.verdict, "eligible_pending_lca"),
      ),
    )
    .returning({ id: eligibilityResults.id });

  return updated.length > 0;
}

const recordAttempt = async (
  database: Database,
  row: PendingLcaRow,
  lcaStatus: "not_found" | "error",
): Promise<void> => {
  await database
    .update(eligibilityResults)
    .set({ lcaCheckAttempts: row.lcaCheckAttempts + 1, lcaStatus })
    .where(
      and(
        eq(eligibilityResults.id, row.id),
        eq(eligibilityResults.verdict, "eligible_pending_lca"),
      ),
    );
};

async function settleRow(
  database: Database,
  row: PendingLcaRow,
  outcome: RowOutcome,
  history: HistoryRecorder,
  counters: Counters,
  dryRun: boolean,
): Promise<void> {
  const subject = rowSubject(row);

  if (outcome.kind === "confirmed") {
    const moved = dryRun || (await markConfirmed(database, row));

    if (!moved) {
      counters.skipped += 1;
      await history.record({
        actor: "worker",
        action: "lca_checks.skipped",
        status: "skipped",
        subject,
        responsePayload: { eligibility_result_id: row.id, reason: "verdict_moved" },
      });
      return;
    }

    counters.confirmed += 1;
    await history.record({
      actor: "worker",
      action: "lca_checks.confirmed",
      status: "success",
      subject,
      responsePayload: {
        eligibility_result_id: row.id,
        pass_sport_code: outcome.passSportCode,
        verdict_before: "eligible_pending_lca",
        verdict_after: "eligible_confirmed",
        candidate_index: outcome.candidateIndex,
        dry_run: dryRun,
      },
    });
    return;
  }

  if (outcome.kind === "code_mismatch") {
    counters.mismatches += 1;

    if (!dryRun) await recordAttempt(database, row, "error");

    // Identifiers only, never a name.
    Sentry.captureMessage("LCA served a pass Sport code other than the one minted for this row", {
      level: "warning",
      tags: { component: "lca-checks", app: "worker" },
      extra: {
        eligibilityResultId: row.id,
        storedCode: row.passSportCode,
        lcaCodes: outcome.lcaCodes,
      },
    });

    await history.record({
      actor: "worker",
      action: "lca_checks.code_mismatch",
      status: "error",
      subject,
      responsePayload: {
        eligibility_result_id: row.id,
        stored_code: row.passSportCode,
        lca_codes: outcome.lcaCodes,
      },
    });
    return;
  }

  if (outcome.kind === "unprocessable") {
    counters.skipped += 1;

    if (!dryRun) await recordAttempt(database, row, "error");

    await history.record({
      actor: "worker",
      action: "lca_checks.unprocessable",
      status: "skipped",
      subject,
      responsePayload: { eligibility_result_id: row.id, reason: outcome.reason },
    });
    return;
  }

  if (outcome.kind === "error") {
    counters.errors += 1;

    if (!dryRun) await recordAttempt(database, row, "error");
    return;
  }

  counters.stillPending += 1;

  if (!dryRun) await recordAttempt(database, row, "not_found");

  await history.record({
    actor: "worker",
    action: "lca_checks.still_pending",
    status: "not_found",
    subject,
    responsePayload: {
      eligibility_result_id: row.id,
      stage: outcome.stage,
      attempts: row.lcaCheckAttempts + 1,
    },
  });
}

// ─── Seconde passe : le code par courriel ────────────────────────────────────

/**
 * The FranceConnect beneficiaries who hold a code and have never been told.
 *
 * `email_kind is null` is what restricts this to the FranceConnect path, and it is not a
 * convention: the parcours hors FranceConnect names its template at insert time (jobs/lca.ts), so
 * a null there means no code mail has ever been decided for this row. It also keeps the hors-FC
 * rows whose mail FAILED out of this sweep — those belong to that job, not this one.
 *
 * Two chemins amènent une ligne ici, et cette requête ne les distingue pas : le rapprochement avec
 * la base bénéficiaires du lamp (writeback_confirmed.sql) et la boucle ci-dessus. Ce qui compte
 * est l'état, pas comment on y est arrivé.
 */
const selectMailableRows = async (
  database: Database,
  cooldownMin: number,
  attemptCeiling: number,
  limit?: number,
): Promise<FcCodeEmailRow[]> => {
  const query = database
    .select({
      id: eligibilityResults.id,
      source: eligibilityResults.source,
      situation: eligibilityResults.situation,
      allocataireIdentite: eligibilityResults.allocataireIdentite,
      enfantIdentite: eligibilityResults.enfantIdentite,
      passSportCode: eligibilityResults.passSportCode,
      email: eligibilityResults.email,
      emailAttempts: eligibilityResults.emailAttempts,
      allocataireFcSub: eligibilityResults.allocataireFcSub,
    })
    .from(eligibilityResults)
    .where(
      and(
        eq(eligibilityResults.verdict, "eligible_confirmed"),
        isNotNull(eligibilityResults.passSportCode),
        isNotNull(eligibilityResults.email),
        eq(eligibilityResults.emailSent, false),
        isNull(eligibilityResults.emailKind),
        lt(eligibilityResults.emailAttempts, attemptCeiling),
        or(
          eq(eligibilityResults.emailAttempts, 0),
          lt(eligibilityResults.updatedAt, sql`now() - make_interval(mins => ${cooldownMin})`),
        ),
      ),
    )
    .orderBy(asc(eligibilityResults.emailAttempts), asc(eligibilityResults.updatedAt));

  return limit != null ? query.limit(limit) : query;
};

/**
 * Records the attempt BEFORE the mail goes out, and returns whether this pass owns the row.
 *
 * The order is the whole idempotence story. Link Mobility answers a verdict in three of its four
 * outcomes — accepted, rejected, HTTP error — and recordEmailDelivery marks the row from that
 * answer. The fourth is the one with no answer at all: a timeout, a severed socket, a worker
 * killed mid-POST. There is nothing to read then, and the mail may or may not have left. This
 * counter is what turns that unknown into a bounded number of resends instead of an endless one.
 *
 * The guard on email_sent also makes the claim atomic, which matters less than it looks: the queue
 * runs at a global concurrency of 1 (index.ts). It is a redelivered stalled job, not a second
 * worker, that this actually protects against.
 */
const claimEmailAttempt = async (
  database: Database,
  row: FcCodeEmailRow,
  attemptCeiling: number,
): Promise<boolean> => {
  const claimed = await database
    .update(eligibilityResults)
    .set({ emailAttempts: row.emailAttempts + 1 })
    .where(
      and(
        eq(eligibilityResults.id, row.id),
        eq(eligibilityResults.emailSent, false),
        lt(eligibilityResults.emailAttempts, attemptCeiling),
      ),
    )
    .returning({ id: eligibilityResults.id });

  return claimed.length > 0;
};

// Link Mobility named a rejection bound to the request itself. Spending the remaining attempts on
// it would only delay the moment someone reads the Sentry alert.
const freezeRow = async (
  database: Database,
  rowId: string,
  attemptCeiling: number,
): Promise<void> => {
  await database
    .update(eligibilityResults)
    .set({ emailAttempts: attemptCeiling })
    .where(eq(eligibilityResults.id, rowId));
};

async function mailRow(
  job: Job<LcaChecksJobData>,
  database: Database,
  row: FcCodeEmailRow,
  history: HistoryRecorder,
  counters: Counters,
  attemptCeiling: number,
  dryRun: boolean,
): Promise<void> {
  const subject = codeEmailRowSubject(row);
  const decision = decideEmailKind(row);

  if ("skip" in decision) {
    counters.mailSkipped += 1;

    // 'unknown_situation' is the only one worth an alert: the others describe a row that could
    // never be mailed, this one describes a row we stopped being able to mail.
    if (decision.skip === "unknown_situation") {
      Sentry.captureMessage("FranceConnect row holds a code but no situation to pick a template", {
        level: "warning",
        tags: { component: "fc-code-emails", app: "worker" },
        extra: { eligibilityResultId: row.id, source: row.source },
      });
    }

    await history.record({
      actor: "worker",
      action: "fc_code_emails.skipped",
      status: "skipped",
      subject,
      responsePayload: { eligibility_result_id: row.id, reason: decision.skip },
    });
    return;
  }

  if (dryRun) {
    counters.mailed += 1;
    return;
  }

  if (!(await claimEmailAttempt(database, row, attemptCeiling))) {
    counters.mailSkipped += 1;
    await history.record({
      actor: "worker",
      action: "fc_code_emails.skipped",
      status: "skipped",
      subject,
      responsePayload: { eligibility_result_id: row.id, reason: "claim_lost" },
    });
    return;
  }

  const recipient = row.email ?? "";
  const { kind } = decision;
  const delayMinutes = emailDelayMinutes();
  const sendAt = delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : undefined;

  // email_sent_at dates the acceptance, scheduled_for the diffusion.
  const delivery = await recordEmailDelivery({
    job,
    database,
    history,
    resultId: row.id,
    kind,
    subject,
    recipient,
    bodyPayload: {
      to: recipient,
      email_kind: kind,
      attempt: row.emailAttempts + 1,
      scheduled_for: sendAt?.toISOString() ?? null,
    },
    send: () => sendOutcomeEmail(recipient, rowToEmailVariables(row, kind), sendAt),
  });

  if (delivery.sent) {
    counters.mailed += 1;
    return;
  }

  if (delivery.terminal) {
    counters.mailTerminal += 1;
    await freezeRow(database, row.id, attemptCeiling);

    Sentry.captureMessage("Link Mobility rejected a pass Sport code mail for good", {
      level: "error",
      tags: { component: "fc-code-emails", app: "worker" },
      extra: { eligibilityResultId: row.id, emailKind: kind },
    });

    await history.record({
      actor: "worker",
      action: "fc_code_emails.terminal",
      status: "error",
      subject,
      responsePayload: { eligibility_result_id: row.id, email_kind: kind },
    });
    return;
  }

  counters.mailFailed += 1;
}

async function sweepCodeEmails(
  job: Job<LcaChecksJobData>,
  database: Database,
  counters: Counters,
  options: {
    deadline: number;
    dryRun: boolean;
    limit?: number;
  },
): Promise<{ selected: number; stoppedEarly: boolean }> {
  const attemptCeiling = maxEmailAttempts();
  const rows = await selectMailableRows(
    database,
    emailCooldownMinutes(),
    attemptCeiling,
    options.limit,
  );

  const delayMinutes = emailDelayMinutes();

  console.log(
    `[pass-sport-worker] job ${job.id}: ${rows.length} confirmed row(s) awaiting their code mail${delayMinutes > 0 ? `, programmé à +${delayMinutes} min` : ""}${options.dryRun ? " (dry run)" : ""}`,
  );

  let stoppedEarly = false;

  for (const row of rows) {
    if (Date.now() >= options.deadline) {
      stoppedEarly = true;
      break;
    }

    const rowHistory = createHistoryRecorder(database, {
      allocataireFcSub: row.allocataireFcSub,
      jobId: job.id ?? null,
      attempt: job.attemptsMade,
    });

    try {
      await mailRow(job, database, row, rowHistory, counters, attemptCeiling, options.dryRun);
    } catch (e) {
      // recordEmailDelivery swallows its own failures, so only the claim or the history write can
      // land here. Never rethrown: the pass owes the remaining rows their turn.
      counters.mailFailed += 1;
      Sentry.captureException(e, { tags: { component: "fc-code-emails", app: "worker" } });
    }
  }

  return { selected: rows.length, stoppedEarly };
}

/**
 * Re-asks LCA about every beneficiary still carrying 'eligible_pending_lca': the data/ pipeline
 * minted a code for them and shipped it to LCA, and nothing until now noticed when that injection
 * landed. A /confirm answering the code we hold is that proof, and moving the verdict on to
 * 'eligible_confirmed' is what lets BeneficiaryRecap show the code and the PDF route serve the
 * attestation.
 *
 * A second pass then mails that code to the FranceConnect beneficiaries who now hold one — from
 * either route, this loop or the rapprochement with the lamp beneficiary database
 * (data/2026/partners/franceconnect/writeback_confirmed.sql). It runs after, in the same pass, so
 * a row confirmed above is mailed without waiting for the next cron.
 */
export async function processLcaChecksJob(
  job: Job<LcaChecksJobData>,
  data: LcaChecksJobData,
  deps: LcaChecksDeps,
): Promise<
  Counters & {
    selected: number;
    mailSelected: number;
    stoppedEarly: boolean;
    dryRun: boolean;
    processedAt: string;
  }
> {
  const { db: database } = deps;
  const dryRun = isDryRun(data);
  const cooldownMin = cooldownMinutes();
  const attemptCeiling = maxAttempts();
  const inseeCode = pendingCheckInseeCode();
  const elapsed = startTimer();
  const deadline = Date.now() + maxDurationMs();

  const history = await startJob(job, database, null, {});
  const dueRows = await selectDueRows(database, cooldownMin, attemptCeiling, data.limit);
  const selected = dueRows.length;

  console.log(
    `[pass-sport-worker] job ${job.id}: ${selected} eligible_pending_lca row(s) to re-check${dryRun ? " (dry run)" : ""}`,
  );

  await history.record({
    actor: "worker",
    action: "lca_checks.run_started",
    status: "success",
    responsePayload: {
      selected,
      cooldown_min: cooldownMin,
      max_attempts: attemptCeiling,
      insee_code_used: inseeCode,
      dry_run: dryRun,
      limit: data.limit ?? null,
    },
  });

  const counters: Counters = {
    processed: 0,
    confirmed: 0,
    stillPending: 0,
    mismatches: 0,
    errors: 0,
    skipped: 0,
    mailed: 0,
    mailSkipped: 0,
    mailFailed: 0,
    mailTerminal: 0,
  };
  let stoppedEarly = false;

  if (selected > 0) {
    const lca = await deps.getLca();

    for (const row of dueRows) {
      if (Date.now() >= deadline) {
        stoppedEarly = true;
        break;
      }

      const rowHistory = createHistoryRecorder(database, {
        // Per row, not per pass: job_id holds the pass's BullMQ id and is identical for every row,
        // so without the sub the whole pass would be invisible to the
        // eligibility_history_allocataire_fc_sub_idx lookup.
        allocataireFcSub: row.allocataireFcSub,
        jobId: job.id ?? null,
        attempt: job.attemptsMade,
      });

      try {
        const outcome = await checkRow(lca, row, rowHistory, job.id);

        logPii(`job ${job.id}: ← ${row.id} (${row.source}) -> ${outcome.kind}`);

        await settleRow(database, row, outcome, rowHistory, counters, dryRun);
      } catch (e) {
        // The LCA client returns its failures, so only an unexpected throw lands here. Never
        // rethrown: the pass owes the remaining rows their turn.
        counters.errors += 1;
        Sentry.captureException(e, { tags: { component: "lca-checks", app: "worker" } });
        await rowHistory.record({
          actor: "worker",
          action: "lca_checks.unprocessable",
          status: "error",
          subject: rowSubject(row),
          error: (e as Error).message,
          responsePayload: { eligibility_result_id: row.id, reason: "unexpected_error" },
        });
      }

      counters.processed += 1;
    }
  }

  // Runs even when the loop above stopped on the deadline, and even when it selected nothing: the
  // rows it mails may have been confirmed by the lamp rapprochement days ago. Its own deadline
  // check is what keeps the pass inside the cron interval.
  const mailPass = await sweepCodeEmails(job, database, counters, {
    deadline,
    dryRun,
    limit: data.limit,
  });

  stoppedEarly = stoppedEarly || mailPass.stoppedEarly;

  const summary = { ...counters, selected, mailSelected: mailPass.selected, stoppedEarly, dryRun };

  await history.record({
    actor: "worker",
    action: "lca_checks.run_finished",
    status: "success",
    responsePayload: {
      ...counters,
      selected,
      mail_selected: mailPass.selected,
      stopped_early: stoppedEarly,
      dry_run: dryRun,
      duration_ms: elapsed(),
    },
  });

  console.log(
    `[pass-sport-worker] job ${job.id}: ${counters.confirmed} confirmed, ${counters.stillPending} still pending, ${counters.mismatches} mismatch(es), ${counters.errors} error(s), ${counters.mailed} code mail(s) sent, ${counters.mailSkipped} skipped, ${counters.mailFailed} failed, ${counters.mailTerminal} frozen${stoppedEarly ? " — stopped on the deadline" : ""}`,
  );

  return { ...summary, processedAt: new Date().toISOString() };
}
