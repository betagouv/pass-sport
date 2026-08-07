CREATE TABLE "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"job_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verifications_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX "email_verifications_job_id_idx" ON "email_verifications" USING btree ("job_id");--> statement-breakpoint
-- Same operator-created role and no-op-before-it-exists guard as 0000-0004, with one
-- difference: this is the first WRITE granted to site_readonly, whose name stops being
-- literally true here. It is column-level on purpose — the site can spend a token, and can
-- neither rewrite the payload it is about to replay nor push expires_at back.
--
-- SELECT covers the whole row because the site has to read the payload to enqueue it. That
-- is the same data the site itself produced at submit, so nothing new is exposed; the token
-- is not among it, only its digest.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.email_verifications TO site_readonly;
    GRANT UPDATE ("consumed_at") ON public.email_verifications TO site_readonly;
  END IF;
END
$$;