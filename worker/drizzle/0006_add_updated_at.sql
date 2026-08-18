ALTER TABLE "eligibility_results" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
-- Existing rows have never been updated, so created_at is their truthful value. Added
-- nullable and backfilled rather than DEFAULT now() NOT NULL, which would date every row
-- already in the table to the deploy.
UPDATE "eligibility_results" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "eligibility_results" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "eligibility_results" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
-- A trigger, not a writer-side $onUpdate: this table is also updated in raw SQL by
-- data/2026/partners/franceconnect/writeback_verdict.sql, which no ORM hook would cover.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS eligibility_results_set_updated_at ON "eligibility_results";--> statement-breakpoint
CREATE TRIGGER eligibility_results_set_updated_at
  BEFORE UPDATE ON "eligibility_results"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
