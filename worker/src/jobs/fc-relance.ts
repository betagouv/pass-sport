import type { Job } from "bullmq";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  ORGANISME_BOURSIER,
  RESULT_SITUATION_BOURSIER,
  toResultSituation,
  type EligibilityJobData, ResultSituation,
} from "../eligibility/types";
import type { BeneficiaryCandidate } from "../eligibility/candidates";
import type { HistoryRecorder } from "../db/history";
import type { Database } from "../db/client";
import { eligibilityHistory, eligibilityResults } from "../db/schema";
import { assessHousehold, type FranceConnectDeps } from "./france-connect";
import { startJob } from "./shared";
import { fcRelanceAllowlistOnly, fcRelanceCooldownDays } from "../env";

export const FC_RELANCE_ACTION = "fc_relance";

// A row of the run being amended. Only the columns the rapprochement and the optimistic
// guards need: nothing here rewrites an identity.
type TargetRow = {
  id: string;
  source: string;
  familyName: string | null;
  givenName: string | null;
  birthdate: string | null;
  verdict: string;
  isEligible: boolean;
  situation: string | null;
  relanceAllowed: boolean;
};

// The rows of this sub's LAST run that were refused. Same definition of "last run" as the
// application_results_by_sub view and export_eligible_pending.sql — created_at = max(created_at),
// which holds because now() is transaction-scoped and the whole PHASE 2 batch shares one instant.
const findLastRunRefusals = async (db: Database, sub: string): Promise<TargetRow[]> =>
  db
    .select({
      id: eligibilityResults.id,
      source: eligibilityResults.source,
      familyName: sql<string | null>`${eligibilityResults.enfantIdentite}->>'family_name'`,
      givenName: sql<string | null>`${eligibilityResults.enfantIdentite}->>'given_name'`,
      birthdate: sql<string | null>`${eligibilityResults.enfantIdentite}->>'birthdate'`,
      verdict: eligibilityResults.verdict,
      isEligible: eligibilityResults.isEligible,
      situation: eligibilityResults.situation,
      relanceAllowed: eligibilityResults.relanceAllowed,
    })
    .from(eligibilityResults)
    .where(
      and(
        eq(eligibilityResults.allocataireFcSub, sub),
        eq(eligibilityResults.verdict, "not_eligible"),
        sql`${eligibilityResults.createdAt} = (
          select max(created_at) from eligibility_results where allocataire_fc_sub = ${sub}
        )`,
      ),
    );

const hasRecentRelance = async (db: Database, sub: string, days: number): Promise<boolean> => {
  const [row] = await db
    .select({ id: eligibilityHistory.id })
    .from(eligibilityHistory)
    .where(
      and(
        eq(eligibilityHistory.allocataireFcSub, sub),
        eq(eligibilityHistory.action, FC_RELANCE_ACTION),
        sql`${eligibilityHistory.createdAt} > now() - ${`${days} days`}::interval`,
      ),
    )
    .limit(1);

  return row != null;
};

const matchesCandidate = (row: TargetRow, candidate: BeneficiaryCandidate): boolean =>
  row.source === "enfant" &&
  row.familyName === candidate.lastname &&
  row.givenName === candidate.firstname &&
  row.birthdate === candidate.birthdate;

const findRowFor = (
  candidate: BeneficiaryCandidate,
  rows: TargetRow[],
  taken: Set<string>,
): TargetRow | undefined =>
  rows.find(
    (row) =>
      !taken.has(row.id) &&
      (candidate.source === "self" ? row.source === "self" : matchesCandidate(row, candidate)),
  );

const skip = (history: HistoryRecorder, raison: string, extra: Record<string, unknown> = {}) =>
  history.record({
    actor: "worker",
    action: FC_RELANCE_ACTION,
    status: "skipped",
    responsePayload: { raison, ...extra },
  });

export type FcRelanceOutcome = {
  targeted: number;
  updated: number;
  apCalls: number;
  raison?: string;
  processedAt: string;
};

// Re-judges a household that came out refused and AMENDS its existing rows. This processor
// contains no insert at all, which is what makes "a relance never adds a line to
// eligibility_results" structural rather than conditional: a beneficiary with no row of their own
// — a child who joined the foyer since the initial run — cannot be served here, and is traced
// instead.
export async function processFcRelanceJob(
  job: Job<EligibilityJobData>,
  data: EligibilityJobData,
  deps: FranceConnectDeps,
): Promise<FcRelanceOutcome> {
  const { db: database } = deps;
  const sub = data.identity.sub ?? null;

  console.log(`[pass-sport-worker] job ${job.id}: relance`);

  const history = await startJob(job, database, sub, data);

  const done = (raison: string): FcRelanceOutcome => ({
    targeted: 0,
    updated: 0,
    apCalls: 0,
    raison,
    processedAt: new Date().toISOString(),
  });

  if (!sub) {
    await skip(history, "sans_sub");
    return done("sans_sub");
  }

  // Only on a first pass: a BullMQ retry is the SAME relance resuming, and it would otherwise
  // be turned away by the trace its own first attempt left.
  if (job.attemptsMade === 0 && (await hasRecentRelance(database, sub, fcRelanceCooldownDays()))) {
    await skip(history, "quota", { cooldown_days: fcRelanceCooldownDays() });
    return done("quota");
  }

  const targets = await findLastRunRefusals(database, sub);

  if (targets.length === 0) {
    // A race only: the button is shown to a usager who has at least one refused row.
    await skip(history, "aucun_not_eligible");
    return done("aucun_not_eligible");
  }

  const allowlistOnly = fcRelanceAllowlistOnly();
  const isAllowed = (row: TargetRow) => !allowlistOnly || row.relanceAllowed;

  if (!targets.some(isAllowed)) {
    await skip(history, "relance_non_autorisee");
    return done("relance_non_autorisee");
  }

  const { results, candidates, householdCaisse } = await assessHousehold(job, data, deps, history);

  const taken = new Set<string>();
  let updatedCount = 0;

  for (const candidate of candidates) {
    const row = findRowFor(candidate, targets, taken);

    if (!row) {
      // A beneficiary this run knows and the initial run did not — a child newly attached to the
      // foyer, or one renamed since. Nothing is written: the relance may not create a verdict.
      await history.record({
        actor: "worker",
        action: FC_RELANCE_ACTION,
        status: "skipped",
        subject: candidate.source,
        responsePayload: {
          raison: "beneficiaire_hors_perimetre",
          aides: candidate.eligibilities,
          raisons: candidate.reasons,
        },
      });
      continue;
    }

    taken.add(row.id);

    if (!isAllowed(row)) {
      await history.record({
        actor: "worker",
        action: FC_RELANCE_ACTION,
        status: "skipped",
        subject: candidate.source,
        responsePayload: {
          raison: "relance_non_autorisee",
          eligibility_result_id: row.id,
          verdict_avant: row.verdict,
        },
      });
      continue;
    }

    const aide = candidate.eligibilities[0];
    const situation = aide ? toResultSituation(aide) : null;
    let updated = false;

    if (situation) {
      // Never a downgrade, and never over a row that moved since it was read: the same optimistic
      // guards as writeback_verdict.sql. A single UPDATE is already atomic.
      const written = await database
        .update(eligibilityResults)
        .set({
          isEligible: true,
          verdict: "eligible_pending",
          situation,
          // email_kind stays null and email_sent stays false, which is precisely what makes the
          // row eligible to the fc_code_emails sweep once data/ has minted its code.
          caisse: situation === RESULT_SITUATION_BOURSIER ? ORGANISME_BOURSIER : householdCaisse,
        })
        .where(
          and(
            eq(eligibilityResults.id, row.id),
            eq(eligibilityResults.verdict, "not_eligible"),
            eq(eligibilityResults.isEligible, false),
            isNull(eligibilityResults.passSportCode),
          ),
        )
        .returning({ id: eligibilityResults.id });

      updated = written.length > 0;
      if (updated) updatedCount += 1;
    }

    await history.record({
      actor: "worker",
      action: FC_RELANCE_ACTION,
      status: "success",
      subject: candidate.source,
      responsePayload: {
        eligibility_result_id: row.id,
        verdict_avant: row.verdict,
        verdict_apres: updated ? "eligible_pending" : row.verdict,
        is_eligible_avant: row.isEligible,
        is_eligible_apres: updated,
        situation_avant: row.situation,
        situation_apres: updated ? situation : row.situation,
        aides: candidate.eligibilities,
        raisons: candidate.reasons,
        updated,
      },
    });
  }

  for (const row of targets.filter((r) => !taken.has(r.id))) {
    // Someone the initial run pronounced on and this one no longer knows of — gone from the
    // foyer. The row is left exactly as it stands.
    await history.record({
      actor: "worker",
      action: FC_RELANCE_ACTION,
      status: "skipped",
      subject: row.source === "enfant" ? "enfant" : "self",
      responsePayload: {
        raison: "beneficiaire_absent_du_foyer",
        eligibility_result_id: row.id,
        verdict_avant: row.verdict,
      },
    });
  }

  console.log(
    `[pass-sport-worker] job ${job.id}: relance — ${results.length} AP calls, ${targets.length} refused rows, ${updatedCount} raised`,
  );

  return {
    targeted: targets.length,
    updated: updatedCount,
    apCalls: results.length,
    processedAt: new Date().toISOString(),
  };
}
