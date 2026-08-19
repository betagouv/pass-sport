-- Contrôle d'après write-back : combien des bénéficiaires de ce passage sont ENCORE en
-- verdict 'eligible_pending', ou sans ligne d'historique 'psp.code_writeback' ? La réponse
-- doit être 0.
--
-- writeback_verdict.sql affiche trois comptes qu'un humain lit ; la cron, elle, a besoin
-- d'une seule valeur sur laquelle s'arrêter. C'est ce que fait ce script : une valeur non
-- nulle veut dire que des codes viennent d'être fabriqués sans être marqués en base, et
-- qu'un prochain passage en fabriquerait un second aux mêmes personnes. run_fc_pipeline.sh
-- refuse de déposer le CSV de production tant que cette valeur n'est pas 0.
--
-- Usage, à travers le tunnel Scalingo, DEPUIS CE DOSSIER :
--
--   cd data/2026/partners/franceconnect
--   psql "$FC_DATABASE_URL" -Atq -f check_writeback.sql
--
-- -q en plus de -At : sans lui psql fait précéder le compte des étiquettes de commande
-- (CREATE TABLE, COPY n) et le shell ne lirait pas un nombre. La table temporaire n'est pas
-- explicitement supprimée pour la même raison — elle disparaît de toute façon avec la
-- session, et un `DROP TABLE` de plus s'afficherait APRÈS la valeur cherchée.
--
-- Même contrainte de dossier que writeback_verdict.sql, et pour la même raison : \copy
-- s'exécute côté client et son chemin ne peut pas être passé en variable. Le nom
-- fc_2026_writeback.csv est donc figé lui aussi (écrit par fc_pipeline.py writeback).
--
-- Le contrôle ne peut PAS être « relancer export_eligible_pending.sql doit rendre un CSV
-- vide » : entre-temps le site continue de tourner et de nouveaux 'eligible_pending' ont pu
-- apparaître. Seuls les ids de ce passage sont donc regardés.

\set ON_ERROR_STOP on

create temp table fc_codes_check (
  eligibility_result_id uuid not null,
  id_psp text not null
);

\copy fc_codes_check from 'fc_2026_writeback.csv' with (format csv, header, delimiter ';')

with historised as (
  -- Un seul parcours, puis anti-jointure : une corrélation par ligne du CSV rescannerait une
  -- table qui ne fait que grossir. Pas de fenêtre temporelle, sinon un rejeu à plus d'un jour
  -- ne verrait plus la trace posée par le passage d'origine.
  select (payload ->> 'eligibility_result_id')::uuid as eligibility_result_id
  from eligibility_history
  where action = 'psp.code_writeback'
)
select
  (select count(*)
     from eligibility_results r
     join fc_codes_check c on c.eligibility_result_id = r.id
    where r.verdict = 'eligible_pending')
+ (select count(*)
     from eligibility_results r
     join fc_codes_check c on c.eligibility_result_id = r.id
    -- Seules les lignes que CE CSV a effectivement marquées doivent avoir une trace : une ligne
    -- passée entre-temps à 'eligible_confirmed' par le worker n'a jamais été marquée ici.
    where r.verdict = 'eligible_pending_lca'
      and r.pass_sport_code = c.id_psp
      and not exists (
        select 1 from historised h where h.eligibility_result_id = r.id));
