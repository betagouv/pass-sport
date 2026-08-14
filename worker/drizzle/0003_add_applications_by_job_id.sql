-- The no-FranceConnect dedup key. applications_by_sub cannot serve this path: its `sub` is
-- null here, so a completed job left nothing behind once BullMQ dropped it, and a resubmitted
-- request re-ran the whole chain against API Particulier.
CREATE VIEW "public"."applications_by_job_id" AS (select "job_id" as "job_id", min("created_at") as "first_application", max("created_at") as "last_application" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is null and "eligibility_results"."job_id" is not null group by "eligibility_results"."job_id");--> statement-breakpoint
-- Same operator-created role and same no-op-before-it-exists guard as 0000-0002. The
-- projection is a hash and two timestamps: no identité pivot, no pass Sport code, which is
-- what makes it safe to grant where eligibility_results itself is not.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.applications_by_job_id TO site_readonly;
  END IF;
END
$$;
