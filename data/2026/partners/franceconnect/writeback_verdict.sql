-- Dernière des 4 étapes (voir README.md) : marquer en base les bénéficiaires à qui un code
-- vient d'être fabriqué, pour que le processus soit rejouable.
--
-- Sans cette étape, export_eligible_pending.sql réextrairait les mêmes personnes au prochain
-- passage et generate_new_codes.ipynb — qui ne déduplique que les codes, jamais les
-- personnes — leur en fabriquerait un second.
--
-- Usage, à travers le tunnel Scalingo, DEPUIS CE DOSSIER :
--
--   cd data/2026/partners/franceconnect
--   psql "$FC_DATABASE_URL" -f writeback_verdict.sql
--
-- Le nom du fichier d'entrée est figé (fc_2026_writeback.csv) plutôt que paramétré, faute de
-- moyen de le paramétrer : \copy est la seule commande psql qui n'interpole aucune variable
-- dans ses arguments, et COPY ... FROM STDIN lit le script lui-même quand celui-ci vient de
-- -f (convention pg_dump), pas une redirection. \copy étant exécuté côté client, le chemin
-- est relatif au dossier depuis lequel psql est lancé — d'où le `cd` ci-dessus.
--
-- Ce fichier est écrit par writeback_codes.ipynb : deux colonnes
-- `eligibility_result_id;id_psp`, en-tête compris.

\set ON_ERROR_STOP on

begin;

-- TEMP : la table disparaît avec la session, rien à nettoyer même si le script échoue.
create temp table fc_codes (
  eligibility_result_id uuid not null,
  id_psp text not null
) on commit drop;

\copy fc_codes from 'fc_2026_writeback.csv' with (format csv, header, delimiter ';')

-- pass_sport_code est écrit en même temps que le verdict : c'est ce qui garde la trace de
-- quel code est parti chez qui, et ce que le site affichera une fois LCA en mesure de servir
-- le code. Le couple « verdict 'eligible_pending_lca' + code présent » dit exactement l'état
-- réel : code fabriqué, pas encore servi par LCA.
--
-- Marquage et trace dans un seul statement : l'historique hérite ainsi de l'idempotence de
-- l'UPDATE — rejoué, celui-ci ne retourne rien et l'INSERT en insère 0.
with marked as (
  update eligibility_results r
     set pass_sport_code = c.id_psp,
         verdict = 'eligible_pending_lca'
    from fc_codes c
   where r.id = c.eligibility_result_id
     -- Ce qui rend le script idempotent : rejoué sur le même fichier il met 0 ligne à jour.
     -- Protège aussi d'un écrasement d'un code venu de LCA ('eligible_confirmed').
     and r.verdict = 'eligible_pending'
  returning r.id, r.job_id, r.allocataire_fc_sub, r.source, r.residence_insee, r.pass_sport_code
)
insert into eligibility_history
  (allocataire_fc_sub, job_id, attempt, actor, action, status, subject, response_payload)
select
  m.allocataire_fc_sub,
  m.job_id,
  0,
  -- run_fc_pipeline.sh est une cron ; valeur déjà dans HistoryActor (worker/src/db/history.ts).
  'cron',
  'psp.code_writeback',
  'success',
  -- source et subject ont le même domaine 'self' | 'enfant'.
  m.source,
  -- http_status, duration_ms et error restent NULL : aucun appel externe ici, une valeur
  -- synthétique se lirait comme un vrai appel.
  jsonb_build_object(
    'eligibility_result_id', m.id,
    'pass_sport_code',       m.pass_sport_code,
    'verdict_before',        'eligible_pending',
    'verdict_after',         'eligible_pending_lca',
    'residence_insee',       m.residence_insee,
    'csv',                   'fc_2026_writeback.csv'
  )
from marked m;

-- Contrôle : ce que le CSV demandait, ce qui a réellement bougé, et ce qui a été ignoré.
-- Un écart non nul signale des lignes déjà marquées (rejeu) ou passées entre-temps à
-- 'eligible_confirmed' par le worker — les deux sont sans danger, mais doivent se voir.
select
  (select count(*) from fc_codes) as lignes_csv,
  (select count(*)
     from eligibility_results r
     join fc_codes c on c.eligibility_result_id = r.id
    where r.verdict = 'eligible_pending_lca'
      and r.pass_sport_code = c.id_psp) as lignes_marquees,
  (select count(*)
     from fc_codes c
    where not exists (select 1 from eligibility_results r where r.id = c.eligibility_result_id)) as ids_introuvables,
  (select count(*)
     from eligibility_history h
     join fc_codes c on c.eligibility_result_id = (h.response_payload ->> 'eligibility_result_id')::uuid
    where h.action = 'psp.code_writeback') as lignes_historisees;

commit;
