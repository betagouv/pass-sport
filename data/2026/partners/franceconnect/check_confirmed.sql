-- Contrôle d'après write-back des bénéficiaires retrouvés en base : combien d'entre eux
-- sont ENCORE en 'eligible_pending', ou sans ligne d'historique 'psp.code_match_base' ? La
-- réponse doit être 0.
--
-- Pendant de check_writeback.sql, et pour la même raison : writeback_confirmed.sql affiche
-- trois comptes qu'un humain lit, la cron a besoin d'une seule valeur sur laquelle
-- s'arrêter. Une valeur non nulle veut dire que des gens ont été appariés sans que la base
-- en garde trace — au passage suivant ils seraient réextraits, et cette fois un code neuf
-- leur serait fabriqué alors qu'ils en ont déjà un.
--
-- Usage, à travers le tunnel Scalingo, DEPUIS CE DOSSIER :
--
--   cd data/2026/partners/franceconnect
--   psql "$FC_DATABASE_URL" -Atq -f check_confirmed.sql
--
-- -q en plus de -At : sans lui psql fait précéder le compte des étiquettes de commande
-- (CREATE TABLE, COPY n) et le shell ne lirait pas un nombre. La table temporaire n'est pas
-- supprimée explicitement pour la même raison — elle disparaît avec la session, et un
-- `DROP TABLE` de plus s'afficherait APRÈS la valeur cherchée.

\set ON_ERROR_STOP on

create temp table fc_confirmes_check (
  eligibility_result_id uuid not null,
  id_psp text not null
);

\copy fc_confirmes_check from 'fc_2026_confirmed.csv' with (format csv, header, delimiter ';')

with historised as (
  -- Un seul parcours puis anti-jointure : une corrélation par ligne du CSV rescannerait une
  -- table qui ne fait que grossir. Pas de fenêtre temporelle, sinon un rejeu à plus d'un
  -- jour ne verrait plus la trace posée par le passage d'origine.
  select (response_payload ->> 'eligibility_result_id')::uuid as eligibility_result_id
  from eligibility_history
  where action = 'psp.code_match_base'
)
select
  (select count(*)
     from eligibility_results r
     join fc_confirmes_check c on c.eligibility_result_id = r.id
    where r.verdict = 'eligible_pending')
+ (select count(*)
     from eligibility_results r
     join fc_confirmes_check c on c.eligibility_result_id = r.id
    where r.verdict = 'eligible_confirmed'
      and r.pass_sport_code = c.id_psp
      and not exists (
        select 1 from historised h where h.eligibility_result_id = r.id));
