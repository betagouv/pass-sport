-- Added in three steps rather than drizzle-kit's bare `ADD COLUMN ... NOT NULL`, which
-- fails outright on a populated table. Existing rows predate the column and their verdict
-- cannot be reconstructed, so they backfill to 'not_assessed' — the value the site filters
-- out of the recap. The DEFAULT is then dropped so the column matches the drizzle snapshot
-- (.notNull() with no default) and a forgotten verdict stays a compile error, not a silent
-- 'not_assessed'.
ALTER TABLE "eligibility_results" ADD COLUMN "verdict" text NOT NULL DEFAULT 'not_assessed';--> statement-breakpoint
ALTER TABLE "eligibility_results" ALTER COLUMN "verdict" DROP DEFAULT;--> statement-breakpoint
CREATE VIEW "public"."application_results_by_sub" AS (select "allocataire_fc_sub" as "sub", "source", "enfant_identite"->>'given_name' as "given_name", "verdict", "created_at" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is not null
        and "eligibility_results"."created_at" = (
          select max(latest.created_at)
          from eligibility_results latest
          where latest.allocataire_fc_sub = "eligibility_results"."allocataire_fc_sub"
        ));--> statement-breakpoint
-- Same operator-created role as 0000, same no-op-before-it-exists guard. This view is the
-- site's only window onto a verdict; the table itself stays ungranted because it carries
-- the identité pivot, and eligibility_history stays ungranted because it carries codes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.application_results_by_sub TO site_readonly;
  END IF;
END
$$;
