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

export const eligibilityResults = pgTable(
  "eligibility_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: text("job_id"),

    // 'self' | 'enfant'. self rows leave enfant_* NULL.
    source: text("source").notNull(),

    // Identité pivot only — `sub` is excluded, it lives in allocataire_fc_sub below.
    allocataireIdentite: jsonb("allocataire_identite").$type<Omit<PivotIdentity, "sub">>(),
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
    // so the site never has to re-derive the rule that lives in index.ts.
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
    verdict: text("verdict").notNull(),

    emailKind: text("email_kind"),
    emailSent: boolean("email_sent").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
