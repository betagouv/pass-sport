-- payload only ever held the answer; a rename keeps every row already written, unlike the
-- drop/create drizzle-kit would emit on its own.
ALTER TABLE "eligibility_history" RENAME COLUMN "payload" TO "response_payload";--> statement-breakpoint
-- Null on every existing row: nothing recorded the request side before this migration.
ALTER TABLE "eligibility_history" ADD COLUMN "body_payload" jsonb;
