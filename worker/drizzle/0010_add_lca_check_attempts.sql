-- Compteur d'essais du job eligible_pending_lca_checks (worker/src/jobs/lca-checks.ts).
--
-- Aucune reprise à faire : 0 signifie « jamais interrogée », ce qui est l'état des lignes
-- existantes. Aucun GRANT non plus, contrairement à 0002 — cette colonne n'entre dans aucune vue.
ALTER TABLE "eligibility_results" ADD COLUMN "lca_check_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Partiel : ne pèse que sur la population réellement en attente.
CREATE INDEX "eligibility_results_pending_lca_idx" ON "eligibility_results" USING btree ("lca_check_attempts","updated_at") WHERE "eligibility_results"."verdict" = 'eligible_pending_lca';
