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
import type { OutcomeEmailKind } from "../email/notify";
import type { PivotIdentity } from "../eligibility/types";

// The verdict as the USAGER should read it. The verdict column below is where each
// value is documented. 'eligible_pending_lca' is never produced by the worker — the code
// generation under data/ writes it — but it is declared so the type stays the exact set
// of values the column can hold.
export type Verdict =
  | "eligible_confirmed"
  | "eligible_confirmed_but_email_not_matching"
  | "eligible_pending"
  | "eligible_pending_lca"
  | "not_eligible"
  | "not_assessed";

/**
 * What allocataire_identite holds. The identité pivot minus `sub`, which lives in
 * allocataire_fc_sub — Partial because the two-step form knows an allocataire by name alone
 * and boursiers have none at all.
 *
 * `residence_insee` is NOT part of the pivot: FranceConnect never serves it, the usager
 * declares it in our own form. It is duplicated here from the residence_insee column so the
 * jsonb is the allocataire as declared, readable without joining the flat columns. Snake_case
 * like every other key, which are FranceConnect's own.
 *
 * Deliberately not widening PivotIdentity itself: that type is handed WHOLE to API
 * Particulier (eligibility/sequence.ts), so anything added to it risks reaching the API.
 */
export type AllocataireIdentite = Partial<Omit<PivotIdentity, "sub">> & {
  residence_insee?: string;
};

export const eligibilityResults = pgTable(
  "eligibility_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: text("job_id"),

    // 'self' | 'enfant'. self rows leave enfant_* NULL.
    source: text("source").notNull(),

    allocataireIdentite: jsonb("allocataire_identite").$type<AllocataireIdentite>(),
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
    // Deliberately not email_kind: that one describes what was SENT and is null whenever
    // nothing was. Written once here so the site never has to re-derive the rule that lives
    // in jobs/shared.ts.
    //   'eligible_confirmed'   — LCA a le bénéficiaire, un code part par email
    //   'eligible_confirmed_but_email_not_matching'
    //                          — LCA a le bénéficiaire et un code lui a été servi, mais
    //                            l'adresse saisie au formulaire n'est pas celle que LCA
    //                            détient pour l'allocataire : le code n'a PAS été envoyé.
    //                            Parcours hors FranceConnect uniquement — le parcours FC
    //                            n'a pas d'adresse saisie à confronter.
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
    verdict: text("verdict").$type<Verdict>().notNull(),

    // Which template was sent for this beneficiary, null when none was — the same vocabulary
    // as OutcomeEmailKind, by design. 'acknowledgment' is excluded: that mail is job-level,
    // sent before any beneficiary is known, and belongs to eligibility_history alone.
    //
    // Rows written before the templates carry the retired vocabulary of the hors FranceConnect
    // path: 'code_withheld' and 'not_eligible' where a row written today says
    // 'not_eligible_hors_fc'. This table is never purged, so a query over the hors FC mails has
    // to match all three. What 'code_withheld' distinguished lives in verdict
    // ('eligible_confirmed_but_email_not_matching'), which is the authoritative column anyway.
    emailKind: text("email_kind").$type<OutcomeEmailKind>(),
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
// run. This is the read surface the site is granted. It now also projects an enfant's
// family_name/birthdate/gender alongside given_name — enough identity for the site to
// generate that child's own PDF, the same way it already does for the allocataire (whose
// identity instead comes from their FranceConnect session, not from this view). Still kept
// out: allocataire_identite, residence_insee, lca_status, job_id — none of that is needed to
// name a beneficiary or hand them their own document.
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
      familyName: sql<string | null>`${eligibilityResults.enfantIdentite}->>'family_name'`.as(
        "family_name",
      ),
      birthdate: sql<string | null>`${eligibilityResults.enfantIdentite}->>'birthdate'`.as(
        "birthdate",
      ),
      gender: sql<string | null>`${eligibilityResults.enfantIdentite}->>'gender'`.as("gender"),
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
    // | 'email.acknowledgment' — accusé de réception, posé à l'ouverture d'un job FranceConnect
    // | 'email.code' | 'email.eligible_soon' | 'email.not_eligible'
    // | 'email.not_eligible_hors_fc' | 'email.skipped'
    // | 'email.digest' — RETIRED, written before the per-beneficiary split. This table is
    //   never purged, so a query over email events still has to match it.
    // | 'results.persisted' | 'results.skipped'
    // | 'psp.code_writeback' — written by data/, like the 'eligible_pending_lca' verdict
    action: text("action").notNull(),

    // 'success' | 'not_found' | 'error' | 'rate_limited' | 'skipped'
    // 'skipped' = the checkpoint spared the call, the most useful thing to see on a retry.
    status: text("status").notNull(),

    subject: text("subject"), // 'self' | 'enfant', null on job-level events

    httpStatus: integer("http_status"),
    durationMs: integer("duration_ms"),
    error: text("error"),

    // What went out on the wire: the query params or body the endpoint was called with.
    // Null on the bookkeeping events (results.persisted, results.skipped), which call
    // nothing.
    bodyPayload: jsonb("body_payload").$type<Record<string, unknown>>(),

    // The RAW response. Deliberately unfiltered: id_psp, matricule, courriel and ine all
    // land here, so a case can be replayed exactly as it happened. The single exception
    // is pdf_base_64, dropped for its weight (lca/process.ts) — nothing reads it back.
    //
    // Rows are kept INDEFINITELY: there is no purge, so this table only ever grows and
    // nothing bounds how long the codes and matricules in it live. That makes it the most
    // sensitive table in the schema — hence no GRANT to site_readonly.
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),

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
