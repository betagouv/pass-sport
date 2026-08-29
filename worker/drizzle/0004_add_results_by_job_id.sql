ALTER TABLE "eligibility_results" ADD COLUMN "email" text;--> statement-breakpoint
CREATE VIEW "public"."application_results_by_job_id" AS (select "job_id" as "job_id", 
  case
    when "email" is null then null
    else left(split_part("email", '@', 1), 1)
      || '***'
      || case
           when length(split_part("email", '@', 1)) > 1
           then right(split_part("email", '@', 1), 1)
           else ''
         end
      || '@'
      || split_part("email", '@', 2)
  end as "email_mask", "email_sent", "created_at" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is null
        and "eligibility_results"."job_id" is not null
        and "eligibility_results"."created_at" = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.job_id = "eligibility_results"."job_id"
        ));--> statement-breakpoint
-- Same operator-created role and no-op-before-it-exists guard as 0000-0003. Only the MASKED
-- address is granted: the raw eligibility_results.email stays ungranted, so site_readonly
-- cannot reach it whatever the site does.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.application_results_by_job_id TO site_readonly;
  END IF;
END
$$;
