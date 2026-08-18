-- Extraction des bénéficiaires 'eligible_pending' du parcours FranceConnect, pour leur
-- fabriquer un code pass Sport (voir README.md pour l'enchaînement complet des 4 étapes).
--
-- Un 'eligible_pending' est éligible selon nos règles mais absent de la base LCA : son
-- pass_sport_code est NULL et il n'a reçu qu'un mail « eligible_soon ». C'est exactement la
-- population à qui il faut fabriquer un code.
--
-- Usage, à travers le tunnel Scalingo :
--   psql "$FC_DATABASE_URL" -f export_eligible_pending.sql
--   psql "$FC_DATABASE_URL" -v out=/chemin/autre.csv -f export_eligible_pending.sql
--
-- COPY ... TO STDOUT redirigé par \o, et non \copy : \o accepte une requête sur plusieurs
-- lignes (\copy est une méta-commande psql qui doit tenir sur une seule), et TO STDOUT ne
-- demande aucun droit superuser contrairement à COPY TO '<fichier>'.
--
-- Rejouable : les lignes déjà servies portent 'eligible_pending_lca' (posé par
-- writeback_verdict.sql) et sont écartées par les deux filtres du WHERE final.

\set ON_ERROR_STOP on
\if :{?out}
\else
  \set out 'fc_2026_eligible_pending.csv'
\endif

-- :out et non :'out' — \o prend son argument brut, les guillemets d'une interpolation
-- quotée finiraient dans le nom du fichier.
\o :out

COPY (
  with latest_run as (
    -- Un usager peut resoumettre : ne garder que son dernier run. Même règle que la vue
    -- application_results_by_sub (worker/src/db/schema.ts) — created_at est
    -- transaction-scoped dans Postgres, donc toutes les lignes d'un même batch PHASE 2
    -- portent exactement le même timestamp. coalesce(sub, id) pour que le parcours sans
    -- FranceConnect (sub NULL) survive aussi : chaque ligne y est son propre run.
    select coalesce(allocataire_fc_sub, id::text) as run_key,
           max(created_at) as created_at
    from eligibility_results
    group by coalesce(allocataire_fc_sub, id::text)
  ),
  api as (
    -- Dernier appel API Particulier réussi par (job_id, action). job_id vaut le sub et est
    -- donc identique entre deux resoumissions : c'est l'ordre sur created_at qui isole le
    -- run courant. Les 'action' sont les RESOURCE_META[*].resource du worker
    -- (worker/src/eligibility/client.ts).
    select distinct on (job_id, action) job_id, action, payload
    from eligibility_history
    where actor = 'api_particulier' and status = 'success'
    order by job_id, action, created_at desc
  )
  select
    -- La clé du write-back : portée jusqu'au CSV final pour que writeback_verdict.sql sache
    -- quelles lignes marquer.
    r.id as eligibility_result_id,
    r.source,
    r.created_at,
    r.allocataire_fc_sub,
    r.residence_insee,

    -- allocataire_identite = identité pivot FranceConnect, sub exclu (il a sa colonne).
    r.allocataire_identite ->> 'family_name'        as "allocataire-nom_naissance",
    r.allocataire_identite ->> 'preferred_username' as "allocataire-nom_usage",
    r.allocataire_identite ->> 'given_name'         as "allocataire-prenom",
    r.allocataire_identite ->> 'birthdate'          as "allocataire-date_naissance",
    r.allocataire_identite ->> 'gender'             as "allocataire-genre",
    r.allocataire_identite ->> 'birthplace'         as "allocataire-code_insee_naissance",
    r.allocataire_identite ->> 'birthcountry'       as "allocataire-code_pays_naissance",
    r.allocataire_identite ->> 'email'              as "allocataire-courriel",

    -- enfant_identite ne porte QUE family_name/given_name/birthdate : pas de genre. Il est
    -- récupéré côté pandas dans qf_enfants, le tableau brut de la réponse quotient_familial
    -- (clean_fc_lib.resolve_enfant_genre).
    r.enfant_identite ->> 'family_name' as enfant_nom,
    r.enfant_identite ->> 'given_name'  as enfant_prenom,
    r.enfant_identite ->> 'birthdate'   as enfant_date_naissance,

    -- eligibility_results ne mémorise pas QUELLE aide a rendu la personne éligible. Ces
    -- payloads sont ce qui permet de reconstruire la route (jeune/AEEH/AAH/boursier) dans
    -- clean_fc_lib.resolve_situation, et l'organisme dans resolve_organisme.
    qf.payload -> 'data' -> 'quotient_familial' ->> 'valeur'        as qf_valeur,
    qf.payload -> 'data' -> 'quotient_familial' ->> 'fournisseur'   as qf_fournisseur,
    qf.payload -> 'data' -> 'enfants'                               as qf_enfants,
    aah.payload   -> 'data' ->> 'est_beneficiaire'                  as aah_est_beneficiaire,
    crous.payload -> 'data' -> 'statut_boursier' ->> 'est_boursier' as crous_est_boursier

  from eligibility_results r

  join latest_run l
    on l.run_key = coalesce(r.allocataire_fc_sub, r.id::text)
   and l.created_at = r.created_at

  -- dss.allocation_enfant_handicape_identite n'est volontairement PAS joint : ses lignes
  -- d'historique ne portent pas le childIndex (action identique pour tous les enfants d'un
  -- même job), elles ne sont donc rattachables à aucun enfant en particulier. La route AEEH
  -- se redéduit sans elles — quotient + fenêtre de naissance suffisent, exactement comme
  -- dans worker/src/lca/candidates.ts.
  left join api qf
    on qf.job_id = r.job_id
   and qf.action = 'dss.quotient_familial_identite'
  left join api aah
    on aah.job_id = r.job_id
   and aah.action = 'dss.allocation_adulte_handicape_identite'
  left join api crous
    on crous.job_id = r.job_id
   and crous.action = 'cnous.etudiant_boursier_identite'

  where r.verdict = 'eligible_pending'
    -- Second garde-fou, complémentaire du filtre ci-dessus : une resoumission crée des
    -- lignes NEUVES en 'eligible_pending' pour quelqu'un déjà servi lors d'un run précédent,
    -- et latest_run les retiendrait. On écarte donc tout bénéficiaire (même sub, même
    -- source, même identité enfant) portant déjà un 'eligible_pending_lca'.
    and not exists (
      select 1
      from eligibility_results prev
      where prev.verdict = 'eligible_pending_lca'
        and prev.allocataire_fc_sub = r.allocataire_fc_sub
        and prev.source = r.source
        and coalesce(prev.enfant_identite ->> 'given_name',  '') = coalesce(r.enfant_identite ->> 'given_name',  '')
        and coalesce(prev.enfant_identite ->> 'family_name', '') = coalesce(r.enfant_identite ->> 'family_name', '')
        and coalesce(prev.enfant_identite ->> 'birthdate',   '') = coalesce(r.enfant_identite ->> 'birthdate',   '')
    )

  order by r.created_at, r.id
) TO STDOUT WITH (format csv, header, force_quote *);

\o

\echo 'export terminé ->' :out
