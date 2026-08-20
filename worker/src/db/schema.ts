import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { PivotIdentity } from "../eligibility/types";

// The verdict as the USAGER should read it. The verdict column below is where each
// value is documented. 'eligible_pending_lca' is never produced by the worker — the code
// generation under data/ writes it — but it is declared so the type stays the exact set
// of values the column can hold.
export type Verdict =
  | "eligible_confirmed"
  | "eligible_pending"
  | "eligible_pending_lca"
  | "not_eligible"
  | "not_assessed";

export const eligibilityResults = pgTable(
  "eligibility_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: text("job_id"),

    // 'self' | 'enfant'. self rows leave enfant_* NULL.
    source: text("source").notNull(),

    // Identité pivot only — `sub` is excluded, it lives in allocataire_fc_sub below. Partial:
    // the two-step form knows an allocataire by name alone, and boursiers have none at all.
    allocataireIdentite: jsonb("allocataire_identite").$type<Partial<Omit<PivotIdentity, "sub">>>(),
    enfantIdentite: jsonb("enfant_identite").$type<Partial<PivotIdentity>>(),

    // FranceConnect pairwise pseudonym for the allocataire. Opaque and NOT derived from
    // the identity. Null on the no-FranceConnect path.
    allocataireFcSub: text("allocataire_fc_sub"),

    isEligible: boolean("is_eligible").notNull(),
    isFranceConnected: boolean("is_france_connected").notNull(),
    residenceInsee: text("residence_insee"),
    passSportCode: text("pass_sport_code"),

    // 'confirmed' | 'not_found' | 'error', or 'not_applicable' on the row recorded for
    // a job that had no beneficiary to send to LCA at all.
    lcaStatus: text("lca_status").notNull(),

    // The verdict as the USAGER should read it, and the only column the site is granted.
    // Deliberately not email_kind: that one describes what was SENT, is null in three
    // unrelated situations, and gets flipped by the email_sent UPDATE. Written once here
    // so the site never has to re-derive the rule that lives in jobs/shared.ts.
    //   'eligible_confirmed'   — LCA a le bénéficiaire, un code part par email
    //   'eligible_pending'     — éligible chez nous, pas encore dans la base LCA
    //   'eligible_pending_lca' — un code a été fabriqué pour cette personne et part vers
    //                            LCA, qui ne le sert pas encore. JAMAIS écrit par le worker:
    //                            il est posé par la génération de codes côté data/, qui
    //                            ramasse les 'eligible_pending' et les marque une fois le
    //                            CSV produit (data/2026/partners/franceconnect/). C'est ce
    //                            qui rend ce ramassage rejouable — sans lui, un second
    //                            passage refabriquerait un code aux mêmes personnes.
    //   'not_eligible'         — aucune route ouverte et aucun match LCA
    //   'not_assessed'         — personne non évaluée (rien de demandé pour elle)
    // The only column the site is granted. Deliberately not email_kind: that one describes
    // what was SENT, is null in three unrelated situations, and gets flipped by the
    // email_sent UPDATE. Written once by the job so the site never has to re-derive it.
    // See the Verdict type above for the values.
    verdict: text("verdict").$type<Verdict>().notNull(),

    emailKind: text("email_kind"),
    emailSent: boolean("email_sent").notNull().default(false),

    // Where the recapitulative email went. Kept so a usager coming back can be told which
    // mailbox to look in — never handed out whole: the site only ever reads the masked
    // projection in application_results_by_job_id.
    email: text("email"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("eligibility_results_allocataire_fc_sub_idx").on(t.allocataireFcSub)],
);

export type EligibilityRow = typeof eligibilityResults.$inferInsert;

export const applicationsBySub = pgView("applications_by_sub").as((qb) =>
  qb
    .select({
      sub: sql<string>`${eligibilityResults.allocataireFcSub}`.as("sub"),
      firstApplication: sql<Date>`min(${eligibilityResults.createdAt})`.as("first_application"),
      lastApplication: sql<Date>`max(${eligibilityResults.createdAt})`.as("last_application"),
    })
    .from(eligibilityResults)
    .where(sql`${eligibilityResults.allocataireFcSub} is not null`)
    .groupBy(eligibilityResults.allocataireFcSub),
);

// Per-beneficiary verdicts and codes for one FranceConnect user, restricted to their LAST
// run. This is the read surface the site is granted — hence the narrow projection: no
// allocataire_identite, no family_name/birthdate, no residence_insee, no lca_status, no
// job_id. A given_name is all the screen needs to name a child to their own parent.
//
// "Last run" keys on created_at, which is safe because it is DEFAULT now() and now() is
// transaction-scoped in Postgres: every row of a PHASE 2 batch carries the exact same
// timestamp. job_id could not do this — it holds the sub, identical across resubmissions.
export const applicationResultsBySub = pgView("application_results_by_sub").as((qb) =>
  qb
    .select({
      sub: sql<string>`${eligibilityResults.allocataireFcSub}`.as("sub"),
      source: eligibilityResults.source,
      givenName: sql<string | null>`${eligibilityResults.enfantIdentite}->>'given_name'`.as(
        "given_name",
      ),
      verdict: eligibilityResults.verdict,
      passSportCode: eligibilityResults.passSportCode,
      createdAt: eligibilityResults.createdAt,
    })
    .from(eligibilityResults)
    .where(
      sql`${eligibilityResults.allocataireFcSub} is not null
        and ${eligibilityResults.createdAt} = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.allocataire_fc_sub = ${eligibilityResults.allocataireFcSub}
        )`,
    ),
);

// The no-FranceConnect counterpart of applications_by_sub. That one keys on the pairwise
// pseudonym, which is null on this path; here the key is job_id, the identity hash the
// site derives before enqueuing (site/src/app/services/eligibility-job.ts).
//
// It exists so a completed job can still be recognised once BullMQ has dropped it: without
// it, resubmitting the same request re-runs the whole chain and re-burns API Particulier
// quota. Narrow on purpose — a hash and two timestamps, no identity, no code — which is
// what makes it grantable to site_readonly.
export const applicationsByJobId = pgView("applications_by_job_id").as((qb) =>
  qb
    .select({
      jobId: sql<string>`${eligibilityResults.jobId}`.as("job_id"),
      firstApplication: sql<Date>`min(${eligibilityResults.createdAt})`.as("first_application"),
      lastApplication: sql<Date>`max(${eligibilityResults.createdAt})`.as("last_application"),
    })
    .from(eligibilityResults)
    .where(
      sql`${eligibilityResults.allocataireFcSub} is null and ${eligibilityResults.jobId} is not null`,
    )
    .groupBy(eligibilityResults.jobId),
);

// Masked in SQL rather than on the site: site_readonly must never receive the address at
// all, so no bug downstream can leak it. Fixed-width stars, so the length of the local part
// is not leaked either. "patrick.nguyen@beta.gouv.fr" -> "p***n@beta.gouv.fr".
const maskedEmail = sql<string | null>`
  case
    when ${eligibilityResults.email} is null then null
    else left(split_part(${eligibilityResults.email}, '@', 1), 1)
      || '***'
      || case
           when length(split_part(${eligibilityResults.email}, '@', 1)) > 1
           then right(split_part(${eligibilityResults.email}, '@', 1), 1)
           else ''
         end
      || '@'
      || split_part(${eligibilityResults.email}, '@', 2)
  end`;

// What the combined form shows a usager coming back with a request already processed:
// which mailbox to look in, and nothing else.
//
// Deliberately NOT the shape of application_results_by_sub. That view is keyed on the
// FranceConnect `sub`, which nobody can produce without authenticating; this one is keyed on
// job_id, an identity hash ANY visitor can recompute by typing someone's name, birthdate and
// commune de naissance into the form. Exposing verdict or pass_sport_code here would turn
// the form into a lookup oracle for other people's codes.
export const applicationResultsByJobId = pgView("application_results_by_job_id").as((qb) =>
  qb
    .select({
      jobId: sql<string>`${eligibilityResults.jobId}`.as("job_id"),
      emailMask: maskedEmail.as("email_mask"),
      emailSent: eligibilityResults.emailSent,
      createdAt: eligibilityResults.createdAt,
    })
    .from(eligibilityResults)
    .where(
      sql`${eligibilityResults.allocataireFcSub} is null
        and ${eligibilityResults.jobId} is not null
        and ${eligibilityResults.createdAt} = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.job_id = ${eligibilityResults.jobId}
        )`,
    ),
);

// Retired. It used to gate the asynchronous no-FranceConnect path: nothing was enqueued until
// the link mailed to the declared address was clicked. That path now answers inside the
// request and queries LCA only, so no row is ever written here again — the table is kept for
// the ones minted before the switch, which sweepEmailVerifications drains.
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // sha256 hex of the token. The token itself is only ever in the email — a read of this
    // table yields no working link.
    tokenHash: text("token_hash").notNull().unique(),

    // The job payload the click replayed. Carries a declared identité pivot, the n° CAF or
    // INE and the address, which is what makes the sweep a retention boundary and not
    // housekeeping.
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

    // The identity hash the site derived before enqueuing, which the job was keyed on.
    jobId: text("job_id").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    // Set by the atomic UPDATE that consumes the token — the single-use guarantee is the
    // `where consumed_at is null` of that statement, not an application-side check.
    consumedAt: timestamp("consumed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("email_verifications_job_id_idx").on(t.jobId)],
);

export type EmailVerificationRow = typeof emailVerifications.$inferInsert;

export const audit = pgTable("audit", {
  id: uuid("id").defaultRandom().primaryKey(),

  jobId: text("job_id"),

  jobName: text("job_name"), // 'france-connect-job'

  // An IP is personal data under RGPD — this table is the retention boundary for it.
  ipAddress: text("ip_address"),

  userAgent: text("user_agent"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditRow = typeof audit.$inferInsert;

// Append-only trace of every action taken on an application, one row per external call.
// eligibility_results says what was decided; this says how we got there — which is the
// only way to explain an outcome once the BullMQ job (and its checkpoint) is gone.
//
// Written outside the PHASE 2 transaction on purpose: a job that throws mid-PHASE 1 must
// still leave its trace, which is exactly when it matters most.
export const eligibilityHistory = pgTable(
  "eligibility_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // The durable correlation key. BullMQ deletes the job on completion, so job_id is
    // only good within a run — the sub outlives it. Null on the non-FranceConnect path.
    allocataireFcSub: text("allocataire_fc_sub"),
    jobId: text("job_id"),

    // job.attemptsMade. What makes a second pass over the same job readable as a retry
    // rather than a duplicate. Only counts REAL failures: a rate-limit pause requeues
    // via Worker.RateLimitError(), which does not consume an attempt — a resumed job
    // is recognised by its status sequence instead.
    attempt: integer("attempt").notNull().default(0),

    // 'api_particulier' | 'lca' | 'worker' | 'cron'
    actor: text("actor").notNull(),

    // 'dss.quotient_familial' | 'dss.aah' | 'cnous.etudiant_boursier' | 'dss.aeeh'
    // | 'lca.search' | 'lca.search.crous_retry' | 'lca.confirm'
    // | 'email.digest' | 'results.persisted'
    // | 'psp.code_writeback' — written by data/, like the 'eligible_pending_lca' verdict
    action: text("action").notNull(),

    // 'success' | 'not_found' | 'error' | 'rate_limited' | 'skipped'
    // 'skipped' = the checkpoint spared the call, the most useful thing to see on a retry.
    status: text("status").notNull(),

    subject: text("subject"), // 'self' | 'enfant', null on job-level events

    httpStatus: integer("http_status"),
    durationMs: integer("duration_ms"),
    error: text("error"),

    // The RAW response. Deliberately unfiltered: id_psp, matricule, courriel and ine all
    // land here, so a case can be replayed exactly as it happened. The single exception
    // is pdf_base_64, dropped for its weight (lca/process.ts) — nothing reads it back.
    //
    // Rows are kept INDEFINITELY: there is no purge, so this table only ever grows and
    // nothing bounds how long the codes and matricules in it live. That makes it the most
    // sensitive table in the schema — hence no GRANT to site_readonly.
    payload: jsonb("payload").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("eligibility_history_allocataire_fc_sub_idx").on(t.allocataireFcSub),
    index("eligibility_history_job_id_idx").on(t.jobId),
    // An append-only log is read in time order; the table never shrinks, so keep it cheap.
    index("eligibility_history_created_at_idx").on(t.createdAt),
  ],
);

export type EligibilityHistoryRow = typeof eligibilityHistory.$inferInsert;
