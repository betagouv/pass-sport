-- Rapprochement des bénéficiaires Grist / Démarches Numériques avec la base bénéficiaires du
-- lamp (lamp01). Indépendant de franceconnect/match_beneficiaires.sql : ce parcours n'a ni la
-- date de naissance du parent, ni la garantie que la situation ou la caisse déclarées soient
-- celles sous lesquelles l'enfant est déjà connu. On compare donc le bénéficiaire, sur TOUTES
-- les situations et caisses de l'exercice, et pour un enfant son parent en plus (type parent),
-- jamais en condition des autres types. Le n° allocataire n'entre jamais en jeu.
--
--   cd <dossier du passage>     # \copy lit grist_dn_candidats.csv dans le dossier courant
--   psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 -v exercice=5 \
--        -v correspondances=/chemin/correspondances.csv -v touchees=/chemin/lamp01-touchees.csv \
--        -f match_grist_dn.sql
--
-- Types de correspondance (une ligne par couple candidat / ligne lamp01) :
--
--   ine      boursier : beneficiaires.allocataire_matricule = INE, organisme cnous
--   exacte   nom, prénom(s) et date de naissance identiques une fois normalisés. Pour un
--            boursier sans INE, en plus : même genre, et ligne lamp01 en situation boursier
--   identite boursier sans INE : nom, prénom(s) et date identiques, mais genre ou situation
--            différents (homonyme ou même personne sous une autre aide : un humain tranche)
--   proche   même date de naissance, et
--              - même nom, prénoms différents mais partageant au moins un mot
--                (LEA / LEA ROSE), ou
--              - mêmes prénoms, noms différents mais partageant au moins un mot
--                (MARTIN / MARTIN DUPONT)
--            Deux jumeaux (même nom, même date, aucun prénom commun) ne sont pas proches.
--   parent   enfant (AEEH, jeune) : même date de naissance et même parent, c'est-à-dire
--            mêmes nom et prénom de l'allocataire, et même genre quand les deux côtés le
--            connaissent (M / Mme). Rattrape un enfant dont le nom ou le prénom a été saisi
--            autrement (LEAH / LEA, nom de l'autre parent). Des jumeaux en relèvent aussi.
--            Seulement pour un couple que ine, exacte et proche n'ont pas déjà trouvé.
--
-- Le genre du bénéficiaire n'est comparé que pour un boursier sans INE : ailleurs, une erreur
-- de saisie ferait rater un doublon. Il est exporté dans les lignes touchées, pour
-- l'investigation.
--
-- Le verdict (doublon pour exacte/ine, à vérifier pour identite, proche ou parent seuls) est
-- posé par grist_dn_pipeline.py split.

\set ON_ERROR_STOP on

\if :{?correspondances}
\else
  \set correspondances 'correspondances.csv'
\endif
\if :{?touchees}
\else
  \set touchees 'lamp01-touchees.csv'
\endif
\if :{?exercice}
\else
  \set exercice 5
\endif

begin;

create temp table gd_candidats (
	eligibility_result_id text not null,
	situation text,
	ine text,
	nom text,
	prenom text,
	date_naissance text,
	genre text,
	allocataire_genre text,
	allocataire_nom text,
	allocataire_prenom text
) on commit drop;

-- `header match`: names and order of grist_dn_pipeline.MATCH_COLUMNS.
\copy gd_candidats (eligibility_result_id, situation, ine, nom, prenom, date_naissance, genre, allocataire_genre, allocataire_nom, allocataire_prenom) from 'grist_dn_candidats.csv' with (format csv, header match, delimiter ';')

create temp table gd_norm on commit drop as
select
	eligibility_result_id,
	situation,
	nullif(btrim(ine), '') as ine,
	nullif(public.normalise_recherche(nom), '') as nom,
	nullif(public.normalise_recherche(prenom), '') as prenom,
	string_to_array(nullif(public.normalise_recherche(nom), ''), ' ') as noms,
	string_to_array(nullif(public.normalise_recherche(prenom), ''), ' ') as prenoms,
	nullif(public.normalise_date_recherche(date_naissance), '')::date as naissance,
	nullif(btrim(genre), '') as genre,
	-- A boursier without INE: nothing but their identity to tell them from a namesake.
	coalesce(situation = 'boursier', false) and nullif(btrim(ine), '') is null as boursier_sans_ine,
	nullif(public.normalise_recherche(allocataire_nom), '') as parent_nom,
	nullif(public.normalise_recherche(allocataire_prenom), '') as parent_prenom,
	-- M or F, as grist_dn_pipeline writes it.
	nullif(btrim(allocataire_genre), '') as parent_genre
from gd_candidats;

-- Only the lamp01 rows born on some candidate's birth date, names normalised once.
create temp table gd_base on commit drop as
select
	b.id_psp,
	public.normalise_recherche(b.nom) as nom,
	public.normalise_recherche(b.prenom) as prenom,
	string_to_array(public.normalise_recherche(b.nom), ' ') as noms,
	string_to_array(public.normalise_recherche(b.prenom), ' ') as prenoms,
	b.date_naissance::date as naissance,
	b.genre::text as genre,
	b.situation::text as situation,
	nullif(public.normalise_recherche(b.allocataire_nom), '') as parent_nom,
	nullif(public.normalise_recherche(b.allocataire_prenom), '') as parent_prenom,
	-- The civilité partners and FranceConnect write (M / Mme), raw spellings included.
	case upper(btrim(b.allocataire_qualite))
		when 'M' then 'M' when 'MR' then 'M' when 'MONSIEUR' then 'M'
		when 'MME' then 'F' when 'MLLE' then 'F' when 'MADAME' then 'F' when 'MADEMOISELLE' then 'F'
	end as parent_genre
from public.beneficiaires b
where b.exercice_id = :exercice
  and b.id_psp is not null
  and b.date_naissance::date in (select naissance from gd_norm where naissance is not null);

create temp table gd_correspondances (
	eligibility_result_id text not null,
	id_psp text not null,
	type text not null
) on commit drop;

insert into gd_correspondances (eligibility_result_id, id_psp, type)
select distinct n.eligibility_result_id, b.id_psp, 'ine'
from gd_norm n
join public.beneficiaires b
  on b.allocataire_matricule = n.ine
 and b.organisme = 'cnous'
 and b.exercice_id = :exercice
 and b.id_psp is not null
where n.situation = 'boursier'
  and n.ine is not null;

insert into gd_correspondances (eligibility_result_id, id_psp, type)
select distinct n.eligibility_result_id, b.id_psp,
	case when n.boursier_sans_ine
	      and not coalesce(b.situation = 'boursier' and b.genre = n.genre, false)
	     then 'identite' else 'exacte' end
from gd_norm n
join gd_base b
  on b.naissance = n.naissance
 and b.nom = n.nom
 and b.prenom = n.prenom;

insert into gd_correspondances (eligibility_result_id, id_psp, type)
select distinct n.eligibility_result_id, b.id_psp, 'proche'
from gd_norm n
join gd_base b
  on b.naissance = n.naissance
where ((b.nom = n.nom and b.prenoms && n.prenoms)
    or (b.prenom = n.prenom and b.noms && n.noms))
  and not (b.nom = n.nom and b.prenom = n.prenom);

insert into gd_correspondances (eligibility_result_id, id_psp, type)
select distinct n.eligibility_result_id, b.id_psp, 'parent'
from gd_norm n
join gd_base b
  on b.naissance = n.naissance
 and b.parent_nom = n.parent_nom
 and b.parent_prenom = n.parent_prenom
where n.situation in ('AEEH', 'jeune')
  and (n.parent_genre is null or b.parent_genre is null or b.parent_genre = n.parent_genre)
  and not exists (select 1 from gd_correspondances c
                  where c.eligibility_result_id = n.eligibility_result_id
                    and c.id_psp = b.id_psp);

-- --- Sorties ----------------------------------------------------------------------------
-- :correspondances and not :'correspondances': \o takes its argument raw.

\o :correspondances
copy (
	select eligibility_result_id, id_psp, type
	from gd_correspondances
	order by eligibility_result_id, type, id_psp
) to stdout with (format csv, header, delimiter ';');
\o

-- The lamp01 side of every correspondence: what a human compares in investigation.csv.
\o :touchees
copy (
	select
		b.id_psp,
		b.nom,
		b.prenom,
		to_char(b.date_naissance, 'YYYY-MM-DD') as date_naissance,
		b.genre,
		b.situation,
		b.organisme,
		b.allocataire_qualite,
		b.allocataire_nom,
		b.allocataire_prenom,
		b.allocataire_courriel,
		b.adresse_allocataire_code_insee,
		to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at
	from public.beneficiaires b
	where b.id_psp in (select id_psp from gd_correspondances)
	order by b.id_psp
) to stdout with (format csv, header, delimiter ';');
\o

select
	(select count(*) from gd_candidats) as candidats,
	(select count(distinct eligibility_result_id) from gd_correspondances where type = 'ine') as par_ine,
	(select count(distinct eligibility_result_id) from gd_correspondances where type = 'exacte') as par_exacte,
	(select count(distinct eligibility_result_id) from gd_correspondances where type = 'parent') as par_parent,
	(select count(distinct eligibility_result_id) from gd_correspondances c
	  where type in ('identite', 'proche', 'parent')
	    and not exists (select 1 from gd_correspondances d
	                     where d.eligibility_result_id = c.eligibility_result_id
	                       and d.type in ('exacte', 'ine'))) as a_verifier,
	(select count(*) from gd_candidats c
	  where not exists (select 1 from gd_correspondances d
	                     where d.eligibility_result_id = c.eligibility_result_id)) as sans_correspondance;

commit;
