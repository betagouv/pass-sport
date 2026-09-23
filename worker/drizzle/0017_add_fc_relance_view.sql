CREATE VIEW "public"."fc_relance_last_by_sub" AS (select "allocataire_fc_sub" as "sub", max("created_at") as "last_relance" from "eligibility_history" where "eligibility_history"."action" = 'fc_relance'
        and "eligibility_history"."allocataire_fc_sub" is not null group by "eligibility_history"."allocataire_fc_sub");
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'site_readonly') THEN
    GRANT SELECT ON public.fc_relance_last_by_sub TO site_readonly;
  END IF;
END
$$;