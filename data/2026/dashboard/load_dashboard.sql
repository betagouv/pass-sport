-- Loads one extraction of the LCA dashboards (specs/dashboard/) into the site
-- database, in place of the previous one. Run by run_dashboard.sh, through the Scalingo
-- tunnel, from inside the extraction directory:
--
--   cd /nfs/stats/<extraction> && psql "$DATABASE_URL" -v extraction=<extraction> -f load_dashboard.sql
--
-- \copy interpolates no variable, hence the fixed file names, read from the current directory.
-- Every extraction recomputes the whole series since the campaign opened, so the table is
-- replaced, not appended to; loading the same extraction twice changes nothing.

\set ON_ERROR_STOP on

begin;

-- ordre follows the file lines: COPY assigns the identity row by row, in file order, which is
-- the display order the export queries sorted.
create temp table extraction_csv (
  ordre integer generated always as identity,
  tableau text not null,
  jour date not null,
  code text,
  libelle text not null,
  eligibles integer,
  codes_actives integer not null,
  codes_actives_du_jour integer not null,
  taux_recours numeric(5, 2),
  part_eligibles numeric(5, 2),
  part_actives numeric(5, 2)
) on commit drop;

\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'genre.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'situation.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'organisme.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'region.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'departement.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'age.csv' with (format csv, header, delimiter ';')
\copy extraction_csv (tableau, jour, code, libelle, eligibles, codes_actives, codes_actives_du_jour, taux_recours, part_eligibles, part_actives) from 'federation.csv' with (format csv, header, delimiter ';')

do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['genre', 'situation', 'organisme', 'region', 'departement', 'age', 'federation']) t
  where not exists (select 1 from extraction_csv e where e.tableau = t);
  if missing is not null then
    raise exception 'tableaux absents de l''extraction : %', missing;
  end if;

  if exists (
    select 1
    from extraction_csv
    group by tableau, jour
    having count(*) filter (where libelle = 'Total') <> 1
  ) then
    raise exception 'un tableau n''a pas exactement une ligne Total par jour';
  end if;

  if (
    select count(distinct (premier_jour, dernier_jour, jours))
    from (
      select min(jour) as premier_jour, max(jour) as dernier_jour, count(distinct jour) as jours
      from extraction_csv
      group by tableau
    ) plages
  ) <> 1 then
    raise exception 'les tableaux ne couvrent pas la même plage de jours';
  end if;
end
$$;

-- delete rather than truncate: truncate would lock the page's reads out until the commit, where
-- delete lets them keep seeing the previous extraction.
delete from lca_tableaux_de_bord;

insert into lca_tableaux_de_bord
  (tableau, jour, rang, code, libelle, eligibles, codes_actives, codes_actives_du_jour,
   taux_recours, part_eligibles, part_actives, extrait_le)
select tableau,
       jour,
       row_number() over (partition by tableau, jour order by ordre),
       code,
       libelle,
       eligibles,
       codes_actives,
       codes_actives_du_jour,
       taux_recours,
       part_eligibles,
       part_actives,
       -- The directory name is the extraction time, Paris wall clock.
       to_timestamp(:'extraction', 'YYYY-MM-DD"T"HH24-MI-SS')::timestamp at time zone 'Europe/Paris'
from extraction_csv;

select tableau, count(*) as lignes, min(jour) as premier_jour, max(jour) as dernier_jour
from lca_tableaux_de_bord
group by tableau
order by tableau;

\if :{?dry_run}
rollback;
\else
commit;
\endif
