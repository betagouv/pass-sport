CREATE TABLE "audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text,
	"job_name" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocataire_fc_sub" text,
	"job_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"subject" text,
	"http_status" integer,
	"duration_ms" integer,
	"error" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text,
	"source" text NOT NULL,
	"allocataire_identite" jsonb,
	"enfant_identite" jsonb,
	"allocataire_fc_sub" text,
	"is_eligible" boolean NOT NULL,
	"is_france_connected" boolean NOT NULL,
	"residence_insee" text,
	"lca_status" text NOT NULL,
	"email_kind" text,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eligibility_history_allocataire_fc_sub_idx" ON "eligibility_history" USING btree ("allocataire_fc_sub");--> statement-breakpoint
CREATE INDEX "eligibility_history_job_id_idx" ON "eligibility_history" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "eligibility_history_created_at_idx" ON "eligibility_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "eligibility_results_allocataire_fc_sub_idx" ON "eligibility_results" USING btree ("allocataire_fc_sub");--> statement-breakpoint
CREATE VIEW "public"."applications_by_sub" AS (select "allocataire_fc_sub" as "sub", min("created_at") as "first_application", max("created_at") as "last_application" from "eligibility_results" where "eligibility_results"."allocataire_fc_sub" is not null group by "eligibility_results"."allocataire_fc_sub");--> statement-breakpoint
-- The site reads this view through a dedicated SELECT-only role. Creating a role needs
-- privileges the app user does not have on a managed addon, so it stays an operator step:
--   CREATE ROLE site_readonly LOGIN PASSWORD '<secret>';
-- This grant applies as soon as that role exists, and is a no-op before that.
--
-- eligibility_history is deliberately NOT granted: it holds raw responses, pass Sport
-- codes and matricules included, and is never purged.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT USAGE ON SCHEMA public TO site_readonly;
    GRANT SELECT ON public.applications_by_sub TO site_readonly;
  END IF;
END
$$;
