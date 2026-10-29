CREATE TABLE "fc_dn_dossiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"allocataire_fc_sub" text NOT NULL,
	"demarche_number" integer NOT NULL,
	"dossier_number" integer NOT NULL,
	"dossier_id" text NOT NULL,
	"prefill_token" text NOT NULL,
	"dossier_url" text NOT NULL,
	"state" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fc_dn_dossiers_dossier_number_idx" ON "fc_dn_dossiers" USING btree ("dossier_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fc_dn_dossiers_live_sub_idx" ON "fc_dn_dossiers" USING btree ("allocataire_fc_sub","demarche_number") WHERE "fc_dn_dossiers"."state" <> 'gone';--> statement-breakpoint
CREATE VIEW "public"."fc_dn_dossier_by_sub" AS (select distinct on ("fc_dn_dossiers"."allocataire_fc_sub") "allocataire_fc_sub" as "sub", "dossier_number", "dossier_url", "state", "submitted_at", "created_at" from "fc_dn_dossiers" where "fc_dn_dossiers"."state" <> 'gone' order by "fc_dn_dossiers"."allocataire_fc_sub", "fc_dn_dossiers"."created_at" desc);--> statement-breakpoint
-- set_updated_at() comes from 0006: drizzle cannot express triggers.
CREATE TRIGGER fc_dn_dossiers_set_updated_at
  BEFORE UPDATE ON "fc_dn_dossiers"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.fc_dn_dossier_by_sub TO site_readonly;
  END IF;
END
$$;
