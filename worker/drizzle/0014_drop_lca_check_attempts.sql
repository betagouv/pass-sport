-- The data/ write-back now confirms a minted code on the spot, so no row waits in
-- 'eligible_pending_lca' any more and the job that re-asked LCA about them is gone. Nothing
-- reads this counter or its partial index, and no view selects the column (0010).
DROP INDEX "eligibility_results_pending_lca_idx";--> statement-breakpoint
ALTER TABLE "eligibility_results" DROP COLUMN "lca_check_attempts";
