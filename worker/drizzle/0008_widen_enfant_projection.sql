-- Widens application_results_by_sub so an enfant row carries enough identity
-- (family_name, birthdate, gender, alongside the existing given_name) for the site to
-- generate that child's own pass Sport PDF, the same way it already does for the
-- allocataire. The view has to be dropped and rebuilt, same as 0002 — a DROP takes its
-- grants with it, hence the GRANT at the bottom.
DROP VIEW "public"."application_results_by_sub";--> statement-breakpoint
CREATE VIEW "public"."application_results_by_sub" AS (select "allocataire_fc_sub" as "sub", "source", "enfant_identite"->>'given_name' as "given_name", "enfant_identite"->>'family_name' as "family_name", "enfant_identite"->>'birthdate' as "birthdate", "enfant_identite"->>'gender' as "gender", "verdict", "pass_sport_code", "created_at" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is not null
        and "eligibility_results"."created_at" = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.allocataire_fc_sub = "eligibility_results"."allocataire_fc_sub"
        ));--> statement-breakpoint
-- Restores what the DROP above removed. Same operator-created role as 0000/0001/0002, same
-- no-op-before-it-exists guard. Skipping this is silent: the view still resolves for the
-- worker, and only the site fails, on its very next read.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.application_results_by_sub TO site_readonly;
  END IF;
END
$$;
