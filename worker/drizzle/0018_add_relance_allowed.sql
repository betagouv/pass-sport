DROP VIEW "public"."application_results_by_sub";--> statement-breakpoint
ALTER TABLE "eligibility_results" ADD COLUMN "relance_allowed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE VIEW "public"."application_results_by_sub" AS (select "allocataire_fc_sub" as "sub", "source", "enfant_identite"->>'given_name' as "given_name", "enfant_identite"->>'family_name' as "family_name", "enfant_identite"->>'birthdate' as "birthdate", "enfant_identite"->>'gender' as "gender", "verdict", "pass_sport_code", "relance_allowed", "created_at" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is not null
        and "eligibility_results"."created_at" = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.allocataire_fc_sub = "eligibility_results"."allocataire_fc_sub"
        ));--> statement-breakpoint
-- The DROP above takes the grant with it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.application_results_by_sub TO site_readonly;
  END IF;
END
$$;
