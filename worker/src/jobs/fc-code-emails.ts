import type { Job } from "bullmq";
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import type { Database } from "../db/client";
import { createHistoryRecorder, startTimer, type HistoryRecorder } from "../db/history";
import { eligibilityResults } from "../db/schema";
import { recordEmailDelivery, sendOutcomeEmail } from "../email/notify";
import {
  decideEmailKind,
  type FcCodeEmailRow,
  rowSubject as codeEmailRowSubject,
  rowToEmailVariables,
} from "./fc-code-emails-rows";
import { startJob } from "./shared";

export type FcCodeEmailsJobData = {
  enqueuedAt: string;
  reason?: "cron" | "manual";
  dryRun?: boolean;
  limit?: number;
};

export type FcCodeEmailsDeps = { db: Database };

const positiveNumberFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Kept under the interval between two FranceConnect pipeline runs, which enqueue this job.
const maxDurationMs = (): number =>
  positiveNumberFromEnv("FC_CODE_EMAIL_MAX_DURATION_MIN", 20) * 60_000;

// A code mail that has failed three times is failing on something a fourth send will not change,
// and every attempt costs a real recipient a risk of duplicate.
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

const isDryRun = (data: FcCodeEmailsJobData): boolean =>
  data.dryRun ?? process.env.FC_CODE_EMAIL_DRY_RUN === "1";

type Counters = {
  sent: number;
  skipped: number;
  failed: number;
  terminal: number;
};

/**
 * The FranceConnect beneficiaries who hold a code and have never been told.
 *
 * `email_kind is null` is what restricts this to the FranceConnect path, and it is not a
 * convention: the parcours hors FranceConnect names its template at insert time (jobs/lca.ts), so
 * a null there means no code mail has ever been decided for this row. It also keeps the hors-FC
 * rows whose mail FAILED out of this sweep — those belong to that job, not this one.
 *
 * Two data/ write-backs bring a row here and this query does not tell them apart: a code found in
 * the lamp beneficiary database (writeback_confirmed.sql) and a freshly minted one
 * (writeback_verdict.sql). What counts is the state, not how the row got there.
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
  job: Job<FcCodeEmailsJobData>,
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
    counters.skipped += 1;

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
    counters.sent += 1;
    return;
  }

  if (!(await claimEmailAttempt(database, row, attemptCeiling))) {
    counters.skipped += 1;
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
    counters.sent += 1;
    return;
  }

  if (delivery.terminal) {
    counters.terminal += 1;
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

  counters.failed += 1;
}

async function sweepCodeEmails(
  job: Job<FcCodeEmailsJobData>,
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
      counters.failed += 1;
      Sentry.captureException(e, { tags: { component: "fc-code-emails", app: "worker" } });
    }
  }

  return { selected: rows.length, stoppedEarly };
}

/**
 * Mails their code to the FranceConnect beneficiaries who hold one and have never been told. The
 * data/ pipeline (data/2026/partners/franceconnect/run_fc_pipeline.sh) enqueues it at the end of
 * every successful run, right after its write-backs set 'eligible_confirmed' and the code.
 */
export async function processFcCodeEmailsJob(
  job: Job<FcCodeEmailsJobData>,
  data: FcCodeEmailsJobData,
  deps: FcCodeEmailsDeps,
): Promise<
  Counters & { selected: number; stoppedEarly: boolean; dryRun: boolean; processedAt: string }
> {
  const { db: database } = deps;
  const dryRun = isDryRun(data);
  const elapsed = startTimer();
  const deadline = Date.now() + maxDurationMs();

  const history = await startJob(job, database, null, {});

  await history.record({
    actor: "worker",
    action: "fc_code_emails.run_started",
    status: "success",
    responsePayload: { dry_run: dryRun, limit: data.limit ?? null },
  });

  const counters: Counters = { sent: 0, skipped: 0, failed: 0, terminal: 0 };
  const { selected, stoppedEarly } = await sweepCodeEmails(job, database, counters, {
    deadline,
    dryRun,
    limit: data.limit,
  });

  await history.record({
    actor: "worker",
    action: "fc_code_emails.run_finished",
    status: "success",
    responsePayload: {
      ...counters,
      selected,
      stopped_early: stoppedEarly,
      dry_run: dryRun,
      duration_ms: elapsed(),
    },
  });

  console.log(
    `[pass-sport-worker] job ${job.id}: ${counters.sent} code mail(s) sent, ${counters.skipped} skipped, ${counters.failed} failed, ${counters.terminal} frozen${stoppedEarly ? " — stopped on the deadline" : ""}`,
  );

  return { ...counters, selected, stoppedEarly, dryRun, processedAt: new Date().toISOString() };
}
