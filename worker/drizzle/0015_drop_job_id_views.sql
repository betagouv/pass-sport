-- Both views were added in 0003 and 0004 for the parcours hors FranceConnect, so a request
-- already processed could still be recognised once BullMQ had dropped its job. That lookup was
-- never written: /api/eligibility-test/verdict answers 'sent' and enqueues without reading the
-- base, so nothing — site, worker, data/ pipeline or tests — has ever selected from either view.
--
-- Dropping them takes their grants with it, which is the point: site_readonly held SELECT on two
-- objects no code reads, and application_results_by_job_id was keyed on the identity hash any
-- visitor can recompute from a name, a birthdate and a commune.
DROP VIEW "public"."application_results_by_job_id";--> statement-breakpoint
DROP VIEW "public"."applications_by_job_id";
