// Relance of the FranceConnect usagers refused because API Particulier never answered on the
// commune code FranceConnect served (pre-1976 Corsica 20xxx, pre-2011 Mayotte 985xx). The worker
// now handles those codes (eligibility/birthplace.ts); this re-runs the households judged before.
// The CLI lives in enqueue-cog-relance.ts.
import type { Queue } from "bullmq";
import type pg from "pg";
import { FC_RELANCE_JOB_NAME } from "../queues";
import type { EligibilityJobData, PivotIdentity } from "../eligibility/types";

export const COG_RELANCE_ALLOWLIST_ACTION = "cog_relance.allowlist";

export type CogRelanceTarget = { sub: string; identity: PivotIdentity };

// Last run (same definition as findLastRunRows) not eligible, no code minted, never answered by
// QF / AAH / CNOUS, born on one of the two codes, and never relancé by this script before.
const SELECTION_SQL = `
with dernier as (
  select allocataire_fc_sub as sub, max(created_at) as created_at
    from eligibility_results
   where allocataire_fc_sub is not null
   group by allocataire_fc_sub
),
run as (
  select d.sub,
         bool_or(r.is_eligible) as eligible,
         bool_or(r.pass_sport_code is not null) as a_un_code,
         (array_agg(r.allocataire_identite) filter (where r.source = 'self'))[1] as identite
    from dernier d
    join eligibility_results r
      on r.allocataire_fc_sub = d.sub and r.created_at = d.created_at
   group by d.sub
)
select run.sub, run.identite
  from run
 where run.identite ->> 'birthplace' ~ '^(20[0-9]{3}|985[0-9]{2})$'
   and coalesce(nullif(run.identite ->> 'birthcountry', ''), '99100') = '99100'
   and not run.eligible
   and not run.a_un_code
   and not exists (
         select 1 from eligibility_history h
          where h.allocataire_fc_sub = run.sub
            and h.actor = 'api_particulier'
            and h.status = 'success'
            and h.action in ('dss.quotient_familial_identite', 'dss.quotient_familial',
                             'dss.allocation_adulte_handicape_identite',
                             'cnous.etudiant_boursier_identite'))
   and not exists (
         select 1 from eligibility_history h
          where h.allocataire_fc_sub = run.sub
            and h.action = '${COG_RELANCE_ALLOWLIST_ACTION}')
 order by run.sub
 limit $1`;

// FC_RELANCE_ALLOWLIST_ONLY=yes: fc-relance amends only rows with relance_allowed. Opened on the
// rows of the last run alone — the ones findLastRunRows reads — and traced, so they can be closed
// again by id.
const ALLOWLIST_SQL = `
with autorisees as (
  update eligibility_results r
     set relance_allowed = true, updated_at = now()
   where r.allocataire_fc_sub = any($1::text[])
     and not r.relance_allowed
     and r.created_at = (select max(r2.created_at) from eligibility_results r2
                          where r2.allocataire_fc_sub = r.allocataire_fc_sub)
  returning r.id, r.allocataire_fc_sub
)
insert into eligibility_history (allocataire_fc_sub, actor, action, status, response_payload)
select allocataire_fc_sub, 'worker', '${COG_RELANCE_ALLOWLIST_ACTION}', 'success',
       jsonb_build_object('motif', 'code_cog_perime', 'eligibility_result_ids', jsonb_agg(id))
  from autorisees
 group by allocataire_fc_sub
returning allocataire_fc_sub`;

// Same options as the site's enqueueFcRelanceJob.
const RELANCE_JOB_OPTS = {
  attempts: 2,
  backoff: { type: "escalating" as const },
  removeOnComplete: true,
  removeOnFail: { age: 120 * 86_400 },
  priority: 1,
};

type Queryable = Pick<pg.Pool, "query">;

export const selectCogRelanceTargets = async (
  pool: Queryable,
  limit?: number,
): Promise<CogRelanceTarget[]> => {
  const { rows } = await pool.query<{ sub: string; identite: PivotIdentity }>(SELECTION_SQL, [
    limit ?? null,
  ]);
  return rows.map(({ sub, identite }) => ({ sub, identity: identite }));
};

export const allowCogRelance = async (pool: Queryable, subs: string[]): Promise<string[]> => {
  if (subs.length === 0) return [];
  const { rows } = await pool.query<{ allocataire_fc_sub: string }>(ALLOWLIST_SQL, [subs]);
  return rows.map((row) => row.allocataire_fc_sub);
};

export type CogRelanceOutcome = { enqueued: string[]; busy: string[] };

// A live job for the sub (a demande or a relance in flight) is left alone; a failed one is
// cleared, as the site's clearIfDead does, or add() would be a silent no-op.
export const enqueueCogRelance = async (
  pool: Queryable,
  queue: Queue<EligibilityJobData>,
  targets: CogRelanceTarget[],
): Promise<CogRelanceOutcome> => {
  const ready: CogRelanceTarget[] = [];
  const busy: string[] = [];

  for (const target of targets) {
    const existing = await queue.getJob(target.sub);

    if (existing && (await existing.getState()) !== "failed") {
      busy.push(target.sub);
      continue;
    }

    await existing?.remove();
    ready.push(target);
  }

  // Before add(): the worker reads relance_allowed when it picks the job up.
  await allowCogRelance(
    pool,
    ready.map(({ sub }) => sub),
  );

  for (const { sub, identity } of ready) {
    await queue.add(
      FC_RELANCE_JOB_NAME,
      {
        identity: { ...identity, sub },
        isFranceConnected: true,
        clientIp: null,
        userAgent: "pass-sport-worker/enqueue-cog-relance",
      },
      { ...RELANCE_JOB_OPTS, jobId: sub },
    );
  }

  return { enqueued: ready.map(({ sub }) => sub), busy };
};
