import type { Job } from "bullmq";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import {
  ORGANISME_BOURSIER,
  RESULT_SITUATION_BOURSIER,
  toResultSituation,
  type AllocataireConjointIdentite,
  type Caisse,
  type EligibilityJobData,
} from "../eligibility/types";
import { RESOURCE_META } from "../eligibility/client";
import type { BeneficiaryCandidate } from "../eligibility/candidates";
import type { HistoryRecorder } from "../db/history";
import type { Database } from "../db/client";
import { eligibilityHistory, eligibilityResults, type AllocataireIdentite } from "../db/schema";
import {
  assessHousehold,
  toBeneficiaryRowValues,
  type FranceConnectDeps,
  type RejectedResource,
} from "./france-connect";
import { startJob } from "./shared";
import { fcRelanceAllowlistOnly, fcRelanceCooldownDays } from "../env";

export const FC_RELANCE_ACTION = "fc_relance";

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
  jobId: string | null;
  createdAt: Date;
  allocataireIdentite: AllocataireIdentite | null;
  isFranceConnected: boolean;
  email: string | null;
};

// Every row of this sub's LAST run. Same definition of "last run" as the
// application_results_by_sub view and export_eligible_pending.sql — created_at = max(created_at),
// which holds because now() is transaction-scoped and the whole PHASE 2 batch shares one instant.
const findLastRunRows = async (db: Database, sub: string): Promise<TargetRow[]> =>
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
      jobId: eligibilityResults.jobId,
      createdAt: eligibilityResults.createdAt,
      allocataireIdentite: eligibilityResults.allocataireIdentite,
      isFranceConnected: eligibilityResults.isFranceConnected,
      email: eligibilityResults.email,
    })
    .from(eligibilityResults)
    .where(
      and(
        eq(eligibilityResults.allocataireFcSub, sub),
        sql`${eligibilityResults.createdAt} = (
          select max(created_at) from eligibility_results where allocataire_fc_sub = ${sub}
        )`,
      ),
    );

const isQfOutage = (rejected: RejectedResource): boolean =>
  rejected.resource === RESOURCE_META.qf.resource &&
  rejected.http_status != null &&
  rejected.http_status >= 500;

// Read off that run's results.persisted: a relance writes none, so a QF failing again keeps it.
const lastRunMissedChildren = async (
  db: Database,
  sub: string,
  rows: TargetRow[],
  selfRow: TargetRow,
): Promise<boolean> => {
  if (rows.some((row) => row.source === "enfant")) return false;

  const [persisted] = await db
    .select({ responsePayload: eligibilityHistory.responsePayload })
    .from(eligibilityHistory)
    .where(
      and(
        eq(eligibilityHistory.allocataireFcSub, sub),
        eq(eligibilityHistory.action, "results.persisted"),
        gte(eligibilityHistory.createdAt, selfRow.createdAt),
      ),
    )
    .orderBy(asc(eligibilityHistory.createdAt))
    .limit(1);

  const rejected = persisted?.responsePayload?.rejected_resources;

  return Array.isArray(rejected) && (rejected as RejectedResource[]).some(isQfOutage);
};

const isWithinCooldown = async (db: Database, sub: string, days: number): Promise<boolean> => {
  const since = sql`now() - ${`${days} days`}::interval`;

  const [relance] = await db
    .select({ id: eligibilityHistory.id })
    .from(eligibilityHistory)
    .where(
      and(
        eq(eligibilityHistory.allocataireFcSub, sub),
        eq(eligibilityHistory.action, FC_RELANCE_ACTION),
        sql`${eligibilityHistory.createdAt} > ${since}`,
      ),
    )
    .limit(1);

  if (relance) return true;

  const [run] = await db
    .select({ id: eligibilityResults.id })
    .from(eligibilityResults)
    .where(
      and(
        eq(eligibilityResults.allocataireFcSub, sub),
        sql`${eligibilityResults.createdAt} > ${since}`,
      ),
    )
    .limit(1);

  return run != null;
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
  inserted: number;
  apCalls: number;
  raison?: string;
  processedAt: string;
};

// Re-judges a household and AMENDS the refused rows of its last run. Only inserts the children a
// failed QF call hid from that run; any other beneficiary without a row is traced instead.
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
    inserted: 0,
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
  if (job.attemptsMade === 0 && (await isWithinCooldown(database, sub, fcRelanceCooldownDays()))) {
    await skip(history, "quota", { cooldown_days: fcRelanceCooldownDays() });
    return done("quota");
  }

  const lastRun = await findLastRunRows(database, sub);
  const selfRow = lastRun.find((row) => row.source === "self");
  const missedChildren =
    selfRow != null && (await lastRunMissedChildren(database, sub, lastRun, selfRow));

  const targets = lastRun.filter(
    (row) => row.verdict === "not_eligible" || (missedChildren && row === selfRow),
  );

  if (targets.length === 0) {
    await skip(history, "aucune_cible");
    return done("aucune_cible");
  }

  const allowlistOnly = fcRelanceAllowlistOnly();
  const isAllowed = (row: TargetRow) => !allowlistOnly || row.relanceAllowed;
  const canInsertChildren = missedChildren && selfRow != null && isAllowed(selfRow);

  if (!targets.some(isAllowed)) {
    await skip(history, "relance_non_autorisee");
    return done("relance_non_autorisee");
  }

  const { results, candidates, householdCaisse, conjointIdentite } = await assessHousehold(
    job,
    data,
    deps,
    history,
  );

  const taken = new Set<string>();
  const missingChildren: BeneficiaryCandidate[] = [];
  let updatedCount = 0;

  for (const candidate of candidates) {
    const row = findRowFor(candidate, targets, taken);

    if (!row && candidate.source === "enfant" && canInsertChildren) {
      missingChildren.push(candidate);
      continue;
    }

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

  const inserted = canInsertChildren
    ? await insertMissingChildren(database, sub, selfRow, missingChildren, {
        householdCaisse,
        conjointIdentite,
      })
    : [];

  for (const { id, candidate, values } of inserted) {
    await history.record({
      actor: "worker",
      action: FC_RELANCE_ACTION,
      status: "success",
      subject: "enfant",
      responsePayload: {
        raison: "enfant_recupere_apres_echec_qf",
        eligibility_result_id: id,
        verdict_apres: values.verdict,
        situation_apres: values.situation,
        aides: candidate.eligibilities,
        raisons: candidate.reasons,
        inserted: true,
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
    `[pass-sport-worker] job ${job.id}: relance — ${results.length} AP calls, ${targets.length} targeted rows, ${updatedCount} raised, ${inserted.length} children inserted`,
  );

  return {
    targeted: targets.length,
    updated: updatedCount,
    inserted: inserted.length,
    apCalls: results.length,
    processedAt: new Date().toISOString(),
  };
}

async function insertMissingChildren(
  database: Database,
  sub: string,
  selfRow: TargetRow,
  children: BeneficiaryCandidate[],
  household: {
    householdCaisse: Caisse | null;
    conjointIdentite: AllocataireConjointIdentite | null;
  },
): Promise<
  { id: string; candidate: BeneficiaryCandidate; values: ReturnType<typeof toBeneficiaryRowValues> }[]
> {
  if (children.length === 0) return [];

  const { householdCaisse, conjointIdentite } = household;

  return database.transaction(async (tx) => {
    const inserted = [];

    for (const candidate of children) {
      const values = toBeneficiaryRowValues(candidate, householdCaisse);
      const [{ id }] = await tx
        .insert(eligibilityResults)
        .values({
          ...values,
          // Same instant as the run, read in SQL: a JS Date drops the microseconds.
          createdAt: sql`(select created_at from eligibility_results where id = ${selfRow.id})`,
          jobId: selfRow.jobId,
          allocataireIdentite: selfRow.allocataireIdentite,
          allocataireConjointIdentite: conjointIdentite,
          allocataireFcSub: sub,
          isFranceConnected: selfRow.isFranceConnected,
          residenceInsee: null,
          lcaStatus: "not_applicable",
          passSportCode: null,
          emailKind: null,
          emailSent: false,
          email: selfRow.email,
          relanceAllowed: selfRow.relanceAllowed,
        })
        .returning({ id: eligibilityResults.id });

      inserted.push({ id, candidate, values });
    }

    await tx
      .update(eligibilityResults)
      .set({
        allocataireConjointIdentite: conjointIdentite,
        caisse: sql`coalesce(${eligibilityResults.caisse}, ${householdCaisse})`,
      })
      .where(eq(eligibilityResults.id, selfRow.id));

    return inserted;
  });
}
