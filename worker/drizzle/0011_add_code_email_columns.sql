ALTER TABLE "eligibility_results" ADD COLUMN "email_sent_at" timestamp with time zone;
ALTER TABLE "eligibility_results" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "eligibility_results" ADD COLUMN "situation" text;
CREATE INDEX "eligibility_results_code_email_idx" ON "eligibility_results" USING btree ("email_attempts","updated_at") WHERE "eligibility_results"."verdict" = 'eligible_confirmed' and "eligibility_results"."email_sent" = false and "eligibility_results"."email_kind" is null;
