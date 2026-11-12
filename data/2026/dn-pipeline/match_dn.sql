-- Rapprochement des bénéficiaires Démarches Numériques avec la base bénéficiaires du
-- lamp (lamp01). Indépendant de franceconnect/match_beneficiaires.sql : rien ne garantit que la
-- situation ou la caisse déclarées soient celles sous lesquelles l'enfant est déjà connu. On
-- compare donc le bénéficiaire, sur TOUTES les situations et caisses de l'exercice, et pour un
-- enfant son parent en plus : un enfant n'est un doublon que sous le même parent. Le n°
-- allocataire n'entre jamais en jeu.
--
--   cd <dossier du passage>     # \copy lit dn_candidats.csv dans le dossier courant
--   psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 -v exercice=5 \
--        -v correspondances=/chemin/correspondances.csv -v touchees=/chemin/lamp01-touchees.csv \
--        -f match_dn.sql
--
-- Comparaison : même nom et même date de naissance une fois normalisés, et prénoms identiques
-- ou contenus les uns dans les autres, mot entier par mot entier (LEA / LEA ROSE). Un prénom
-- qui diffère d'une lettre (LEAH / LEA), un nom en plus (MARTIN / MARTIN DUPONT), des prénoms
-- qui ne partagent qu'une partie de leurs mots (MARIE CLAIRE / MARIE ANNE) ou des jumeaux ne
-- donnent aucune correspondance.
--
-- Types de correspondance (une ligne par couple candidat / ligne lamp01) :
--
--   ine      boursier : beneficiaires.allocataire_matricule = INE, organisme cnous, et même
--            identité (son code lui est renvoyé)
--   ine_seul boursier : même INE, mais pas la même identité (INE mal saisi, ou même
--            personne saisie autrement : un humain tranche)
--   exacte   même identité. Pour un enfant (AEEH, jeune), en plus : même parent. Pour un
--            boursier sans INE, en plus : ligne lamp01 en situation boursier
--   identite boursier sans INE : même identité, mais ligne lamp01 sous une autre aide
--            (homonyme ou même personne sous une autre aide : un humain tranche)
--   autre_parent
--            enfant : même identité, mais pas le même parent, ou parent inconnu de lamp01
--            (homonyme, ou même enfant déclaré par son autre parent : un humain tranche)
--   prenom_contenu
--            prénoms différents, l'un contenu dans l'autre, quel que soit le parent ou
--            l'aide (même personne saisie autrement, ou jumeaux : un humain tranche)
--
-- Même parent, c'est-à-dire :
--   - même nom : celui de lamp01 (le nom d'usage côté CNAF), ou son nom de naissance de
--     beneficiaire_cnaf_extra_field, celui que donne DN ;
--   - mêmes prénoms (CLAIRE YSOLDE et CLAIRE sont deux parents différents) ;
--   - même genre (M / Mme) quand les deux côtés le connaissent.
-- La date de naissance du parent n'est jamais comparée : elle ne compte que pour un
-- bénéficiaire AAH ou boursier, qui est son propre allocataire, et c'est alors la sienne,
-- comparée comme date du bénéficiaire.
--
-- Le genre du bénéficiaire n'est jamais comparé : une erreur de saisie ferait rater un
-- doublon. Il est exporté dans les lignes touchées, pour l'investigation.
--
-- Le verdict (doublon pour exacte/ine, à vérifier pour ine_seul, identite, autre_parent ou
-- prenom_contenu seuls) est posé par dn_pipeline.py split.

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

create temp table dn_candidats (
	eligibility_result_id text not null,
	situation text,
	ine text,
	nom text,
	prenom text,
	date_naissance text,
	allocataire_genre text,
	allocataire_nom text,
	allocataire_prenom text
) on commit drop;

-- `header match`: names and order of dn_pipeline.MATCH_COLUMNS.
\copy dn_candidats (eligibility_result_id, situation, ine, nom, prenom, date_naissance, allocataire_genre, allocataire_nom, allocataire_prenom) from 'dn_candidats.csv' with (format csv, header match, delimiter ';')

create temp table dn_norm on commit drop as
select
	eligibility_result_id,
	situation,
	nullif(btrim(ine), '') as ine,
	nullif(public.normalise_recherche(nom), '') as nom,
	nullif(public.normalise_recherche(prenom), '') as prenom,
	string_to_array(nullif(public.normalise_recherche(prenom), ''), ' ') as prenoms,
	nullif(public.normalise_date_recherche(date_naissance), '')::date as naissance,
	-- A boursier without INE: nothing but their identity to tell them from a namesake.
	coalesce(situation = 'boursier', false) and nullif(btrim(ine), '') is null as boursier_sans_ine,
	nullif(public.normalise_recherche(allocataire_nom), '') as parent_nom,
	nullif(public.normalise_recherche(allocataire_prenom), '') as parent_prenom,
	-- M or F, as dn_pipeline writes it.
	nullif(btrim(allocataire_genre), '') as parent_genre
from dn_candidats;

-- Only the lamp01 rows born on some candidate's birth date, names normalised once.
create temp table dn_base on commit drop as
select
	b.id_psp,
	public.normalise_recherche(b.nom) as nom,
	public.normalise_recherche(b.prenom) as prenom,
	-- nullif: an empty array is contained in every other one.
	string_to_array(nullif(public.normalise_recherche(b.prenom), ''), ' ') as prenoms,
	b.date_naissance::date as naissance,
	b.situation::text as situation,
	nullif(public.normalise_recherche(b.allocataire_nom), '') as parent_nom,
	nullif(public.normalise_recherche(x.cnaf_allocataire_nom_naissance), '') as parent_nom_naissance,
	nullif(public.normalise_recherche(b.allocataire_prenom), '') as parent_prenom,
	-- The civilité partners and FranceConnect write (M / Mme), raw spellings included.
	case upper(btrim(b.allocataire_qualite))
		when 'M' then 'M' when 'MR' then 'M' when 'MONSIEUR' then 'M'
		when 'MME' then 'F' when 'MLLE' then 'F' when 'MADAME' then 'F' when 'MADEMOISELLE' then 'F'
	end as parent_genre
from public.beneficiaires b
left join public.beneficiaire_cnaf_extra_field x on x.id_psp = b.id_psp
where b.exercice_id = :exercice
  and b.id_psp is not null
  and b.date_naissance::date in (select naissance from dn_norm where naissance is not null);

create temp table dn_correspondances (
	eligibility_result_id text not null,
	id_psp text not null,
	type text not null
) on commit drop;

-- Every candidate / lamp01 code pair with the same family name, birth date and nested first
-- names, the parent compared once.
create temp table dn_paires on commit drop as
select
	n.eligibility_result_id,
	b.id_psp,
	bool_or(b.prenom = n.prenom) as prenom_identique,
	bool_or(n.boursier_sans_ine and not coalesce(b.situation = 'boursier', false)) as identite_lache,
	bool_or(coalesce(n.situation in ('AEEH', 'jeune'), false)) as enfant,
	bool_or(coalesce(
		n.parent_nom in (b.parent_nom, b.parent_nom_naissance)
		and n.parent_prenom = b.parent_prenom
		and (n.parent_genre is null or b.parent_genre is null or b.parent_genre = n.parent_genre),
		false)) as meme_parent
from dn_norm n
join dn_base b
  on b.naissance = n.naissance
 and b.nom = n.nom
 and (b.prenoms <@ n.prenoms or n.prenoms <@ b.prenoms)
group by n.eligibility_result_id, b.id_psp;

-- Same INE: `ine` only when the identity agrees too, as compared above (an INE typo may point at
-- another student).
insert into dn_correspondances (eligibility_result_id, id_psp, type)
select distinct n.eligibility_result_id, b.id_psp,
	case when exists (select 1 from dn_paires p
	                   where p.eligibility_result_id = n.eligibility_result_id and p.id_psp = b.id_psp)
	     then 'ine' else 'ine_seul' end
from dn_norm n
join public.beneficiaires b
  on b.allocataire_matricule = n.ine
 and b.organisme = 'cnous'
 and b.exercice_id = :exercice
 and b.id_psp is not null
where n.situation = 'boursier'
  and n.ine is not null;

insert into dn_correspondances (eligibility_result_id, id_psp, type)
select eligibility_result_id, id_psp,
	case when not prenom_identique then 'prenom_contenu'
	     when identite_lache then 'identite'
	     when enfant and not meme_parent then 'autre_parent'
	     else 'exacte' end
from dn_paires;

-- --- Sorties ----------------------------------------------------------------------------
-- :correspondances and not :'correspondances': \o takes its argument raw.

\o :correspondances
copy (
	select eligibility_result_id, id_psp, type
	from dn_correspondances
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
		coalesce(nullif(public.normalise_date_recherche(b.allocataire_date_naissance), ''),
		         to_char(x.cnaf_allocataire_date_naissance, 'YYYY-MM-DD')) as allocataire_date_naissance,
		b.allocataire_courriel,
		b.adresse_allocataire_code_insee,
		to_char(b.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') as created_at
	from public.beneficiaires b
	left join public.beneficiaire_cnaf_extra_field x on x.id_psp = b.id_psp
	where b.id_psp in (select id_psp from dn_correspondances)
	order by b.id_psp
) to stdout with (format csv, header, delimiter ';');
\o

select
	(select count(*) from dn_candidats) as candidats,
	(select count(distinct eligibility_result_id) from dn_correspondances where type = 'ine') as par_ine,
	(select count(distinct eligibility_result_id) from dn_correspondances where type = 'exacte') as par_exacte,
	(select count(distinct eligibility_result_id) from dn_correspondances where type = 'autre_parent') as par_autre_parent,
	(select count(distinct eligibility_result_id) from dn_correspondances c
	  where type in ('ine_seul', 'identite', 'autre_parent', 'prenom_contenu')
	    and not exists (select 1 from dn_correspondances d
	                     where d.eligibility_result_id = c.eligibility_result_id
	                       and d.type in ('exacte', 'ine'))) as a_verifier,
	(select count(*) from dn_candidats c
	  where not exists (select 1 from dn_correspondances d
	                     where d.eligibility_result_id = c.eligibility_result_id)) as sans_correspondance;

commit;
