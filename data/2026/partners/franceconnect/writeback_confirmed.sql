-- Marque les bénéficiaires que le rapprochement a RETROUVÉS dans la base bénéficiaires.
--
-- Pendant de writeback_verdict.sql, pour l'autre issue du rapprochement : les deux posent
-- 'eligible_confirmed' et le code, celui-ci sur les gens qui en avaient déjà un —
-- match_beneficiaires.sql a retrouvé leur ligne et son id_psp —, celui-là sur ceux à qui un
-- code vient d'être fabriqué. Seule l'action d'historique les distingue.
--
-- Le parcours FranceConnect n'appelle plus LCA et ne peut donc plus produire ce verdict
-- lui-même : il est désormais posé depuis data/. C'est documenté dans
-- worker/src/db/schema.ts, à côté de la définition de la colonne.
--
-- Usage, à travers le tunnel Scalingo, DEPUIS CE DOSSIER :
--
--   cd data/2026/partners/franceconnect
--   psql "$FC_DATABASE_URL" -f writeback_confirmed.sql
--
-- Nom d'entrée figé (fc_2026_confirmed.csv), même contrainte que writeback_verdict.sql :
-- \copy est la seule commande psql qui n'interpole aucune variable dans ses arguments, et il
-- s'exécute côté client — d'où le `cd`. Le fichier est écrit par match_beneficiaires.sql :
-- deux colonnes `eligibility_result_id;id_psp`, en-tête compris.

\set ON_ERROR_STOP on

begin;

create temp table fc_confirmes (
  eligibility_result_id uuid not null,
  id_psp text not null
) on commit drop;

\copy fc_confirmes from 'fc_2026_confirmed.csv' with (format csv, header, delimiter ';')

-- lca_status n'est pas touché : il reste 'not_applicable', ce qu'il vaut sur tout le
-- parcours FranceConnect. Rien n'a interrogé LCA ici — c'est notre propre base qui a
-- répondu, et écrire 'confirmed' laisserait croire à un appel qui n'a pas eu lieu.
--
-- Marquage et trace dans un seul statement : l'historique hérite ainsi de l'idempotence de
-- l'UPDATE — rejoué, celui-ci ne retourne rien et l'INSERT en insère 0.
with marked as (
  update eligibility_results r
     set pass_sport_code = c.id_psp,
         verdict = 'eligible_confirmed'
    from fc_confirmes c
   where r.id = c.eligibility_result_id
     -- Ce qui rend le script rejouable, et ce qui protège d'un écrasement : seule une ligne
     -- encore en attente est marquée, jamais une ligne qui porte déjà un code.
     and r.verdict = 'eligible_pending'
  returning r.id, r.job_id, r.allocataire_fc_sub, r.source, r.pass_sport_code
)
insert into eligibility_history
  (allocataire_fc_sub, job_id, attempt, actor, action, status, subject, response_payload)
select
  m.allocataire_fc_sub,
  m.job_id,
  0,
  'cron',
  'psp.code_match_base',
  'success',
  m.source,
  jsonb_build_object(
    'eligibility_result_id', m.id,
    'pass_sport_code',       m.pass_sport_code,
    'verdict_before',        'eligible_pending',
    'verdict_after',         'eligible_confirmed',
    'csv',                   'fc_2026_confirmed.csv'
  )
from marked m;

-- Ce que le CSV demandait, ce qui a bougé, ce qui a été ignoré. Un écart non nul signale un
-- rejeu ou une ligne passée entre-temps à un autre verdict : sans danger, mais à voir.
select
  (select count(*) from fc_confirmes) as lignes_csv,
  (select count(*)
     from eligibility_results r
     join fc_confirmes c on c.eligibility_result_id = r.id
    where r.verdict = 'eligible_confirmed'
      and r.pass_sport_code = c.id_psp) as lignes_marquees,
  (select count(*)
     from fc_confirmes c
    where not exists (select 1 from eligibility_results r
                       where r.id = c.eligibility_result_id)) as ids_introuvables;

commit;
