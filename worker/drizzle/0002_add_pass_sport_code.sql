-- The pass Sport code moves from "emailed only" to a stored column, so the site can show
-- it on screen. Nullable and left NULL on existing rows: their code was never kept and
-- cannot be reconstructed, so those users keep reading "envoyé par email".
--
-- The view has to be dropped and rebuilt — the column sits in the middle of the
-- projection, which CREATE OR REPLACE VIEW does not allow. A DROP takes its grants with
-- it, hence the GRANT at the bottom.
DROP VIEW "public"."application_results_by_sub";--> statement-breakpoint
ALTER TABLE "eligibility_results" ADD COLUMN "pass_sport_code" text;--> statement-breakpoint
CREATE VIEW "public"."application_results_by_sub" AS (select "allocataire_fc_sub" as "sub", "source", "enfant_identite"->>'given_name' as "given_name", "verdict", "pass_sport_code", "created_at" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is not null
        and "eligibility_results"."created_at" = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.allocataire_fc_sub = "eligibility_results"."allocataire_fc_sub"
        ));--> statement-breakpoint
-- Restores what the DROP above removed. Same operator-created role as 0000 and 0001, same
-- no-op-before-it-exists guard. Skipping this is silent: the view still resolves for the
-- worker, and only the site fails, on its very next read.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.application_results_by_sub TO site_readonly;
  END IF;
END
$$;