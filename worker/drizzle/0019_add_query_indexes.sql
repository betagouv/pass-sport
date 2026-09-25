-- The migrator runs inside a transaction, so CONCURRENTLY is impossible here and a plain
-- CREATE INDEX blocks writes on eligibility_history while it builds. On a large table, run the
-- same statements with CREATE INDEX CONCURRENTLY by hand before deploying: IF NOT EXISTS then
-- makes this migration a no-op. INCLUDE clauses are hand-written, drizzle cannot express them.
-- Creates come before drops so no query ever runs without an index.
CREATE INDEX IF NOT EXISTS "eligibility_history_sub_action_created_at_idx" ON "eligibility_history" USING btree ("allocataire_fc_sub","action","created_at") INCLUDE ("status","http_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_history_job_id_action_created_at_idx" ON "eligibility_history" USING btree ("job_id","action","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_history_fc_relance_idx" ON "eligibility_history" USING btree ("allocataire_fc_sub","created_at") WHERE "eligibility_history"."action" = 'fc_relance';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_history_qf_by_sub_idx" ON "eligibility_history" USING btree ("allocataire_fc_sub") INCLUDE ("http_status","created_at") WHERE "eligibility_history"."action" in ('dss.quotient_familial_identite', 'dss.quotient_familial') and "eligibility_history"."allocataire_fc_sub" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_history_psp_result_id_idx" ON "eligibility_history" USING btree ((("response_payload" ->> 'eligibility_result_id')::uuid)) WHERE "eligibility_history"."action" in ('psp.code_writeback', 'psp.code_match_base');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_results_sub_created_at_idx" ON "eligibility_results" USING btree ("allocataire_fc_sub","created_at") INCLUDE ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eligibility_results_job_id_idx" ON "eligibility_results" USING btree ("job_id");--> statement-breakpoint
DROP INDEX IF EXISTS "eligibility_history_allocataire_fc_sub_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "eligibility_history_job_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "eligibility_results_allocataire_fc_sub_idx";
