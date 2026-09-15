-- 'CROUS' is our own name for an API Particulier bouquet; everything downstream — the LCA
-- contract, lamp01's public.situation enum, clean_fc_lib — calls that route 'boursier'.
UPDATE "eligibility_results" SET "situation" = 'boursier' WHERE "situation" = 'CROUS';
