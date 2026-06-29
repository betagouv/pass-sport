CREATE TABLE "audit_api_particulier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_id" uuid NOT NULL,
	"france_connected" boolean NOT NULL,
	"client_ip" "inet",
	"user_agent" text,
	"recipient_siret" text,
	"resource" text NOT NULL,
	"http_status" integer,
	"success" boolean NOT NULL,
	"error_code" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE INDEX "idx_audit_ip_created" ON "audit_api_particulier" USING btree ("client_ip","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_api_particulier" USING btree ("created_at");