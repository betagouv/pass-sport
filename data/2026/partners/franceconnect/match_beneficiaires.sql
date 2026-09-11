-- Rapprochement des `eligible_pending` avec la base bénéficiaires du lamp.
--
-- Le parcours FranceConnect n'appelle plus LCA : il ne peut plus savoir si la personne
-- qu'il vient de juger éligible a déjà un code. Cette requête est ce qui remplace cet
-- appel — elle cherche chaque candidat dans la table `beneficiaires`, alimentée par les
-- pipelines CNAF, MSA et CNOUS.
--
-- Elle tourne contre la base LOCALE (lamp01/compose.yml), PAS contre Scalingo :
--
--   cd data/2026/partners/franceconnect
--   psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 \
--        -v apparies=/chemin/apparies.csv -v non_apparies=/chemin/non_apparies.csv \
--        -f match_beneficiaires.sql
--
-- Le nom du fichier d'entrée est figé (fc_2026_match_candidates.csv) faute de moyen de le
-- paramétrer : \copy est la seule commande psql qui n'interpole aucune variable dans ses
-- arguments, et il s'exécute côté client — d'où le `cd` ci-dessus. C'est la même contrainte
-- que writeback_verdict.sql, pour la même raison. Le fichier est écrit par
-- `fc_pipeline.py clean --match-out`.
--
-- ORDRE CRITIQUE : cette étape passe AVANT la génération des codes. Un code tiré est
-- comptabilisé dans EXISTING_CODES_PATHFILE_2026 et ne se reprend pas ; en fabriquer un
-- pour quelqu'un qui en a déjà un est précisément ce qu'on cherche à éviter.
--
-- Six niveaux, du plus sûr au plus lâche. Chacun n'examine que les candidats que les
-- précédents n'ont pas appariés, et ne retient QUE s'il trouve exactement un id_psp :
--
--   N1  INE                                  recherche exacte
--   N2  clé + 1er prénom du bénéficiaire     recherche par préfixe, jusqu'à 8 variantes
--   N3  clé + 2 premiers prénoms             pour les ambigus de N2
--   N4  genre                                départage des ambigus de N2
--   N5  naissance de l'allocataire           départage
--   N6  code postal du foyer                 départage
--
-- Un candidat encore ambigu après N6 n'est pas apparié : il recevra un code neuf, ce qui est
-- le moins risqué des deux.

\set ON_ERROR_STOP on

\if :{?apparies}
\else
  \set apparies 'fc_2026_apparies.csv'
\endif
\if :{?non_apparies}
\else
  \set non_apparies 'fc_2026_non_apparies.csv'
\endif
-- L'exercice de la campagne. Sans ce filtre, une personne connue de la base au titre d'une
-- campagne précédente rendrait un code périmé, et le bénéficiaire repartirait avec un pass
-- qui n'ouvre plus aucun droit.
\if :{?exercice}
\else
  \set exercice 5
\endif

begin;

-- Tout en text : la clé de recherche est du texte, et une colonne typée ferait échouer le
-- \copy sur les valeurs vides que le producteur écrit pour un champ absent.
create temp table fc_candidats (
	eligibility_result_id text not null,
	ine text,
	allocataire_nom text,
	allocataire_nom_usage text,
	allocataire_prenom text,
	allocataire_date_naissance text,
	allocataire_qualite text,
	beneficiaire_nom text,
	beneficiaire_nom_usage text,
	beneficiaire_prenom text,
	beneficiaire_date_naissance text,
	beneficiaire_genre text,
	code_postal text
) on commit drop;

-- `header match` : l'en-tête du fichier doit nommer exactement ces colonnes, dans cet ordre.
-- Sans lui, COPY chargerait par position, et une colonne ajoutée à clean_fc_lib.MATCH_COLUMNS
-- sans l'être ici décalerait silencieusement tout le fichier.
\copy fc_candidats (eligibility_result_id, ine, allocataire_nom, allocataire_nom_usage, allocataire_prenom, allocataire_date_naissance, allocataire_qualite, beneficiaire_nom, beneficiaire_nom_usage, beneficiaire_prenom, beneficiaire_date_naissance, beneficiaire_genre, code_postal) from 'fc_2026_match_candidates.csv' with (format csv, header match, delimiter ';')

create temp table fc_apparies (
	eligibility_result_id text not null,
	id_psp text not null,
	niveau text not null
) on commit drop;

-- Chaque candidat, normalisé UNE fois, par la même fonction que la colonne générée
-- beneficiaires.cle_recherche : c'est ce qui garantit que les deux côtés de la comparaison
-- s'écrivent pareil. Les noms d'usage restent NULL quand ils manquent, pour que la variante
-- correspondante ne soit pas générée plus bas.
create temp table fc_norm on commit drop as
select
	c.eligibility_result_id,
	nullif(btrim(c.ine), '') as ine,
	coalesce(public.normalise_recherche(c.allocataire_nom), '') as alloc_nom_naissance,
	nullif(public.normalise_recherche(c.allocataire_nom_usage), '') as alloc_nom_usage,
	coalesce(public.normalise_recherche(c.allocataire_prenom), '') as alloc_prenom,
	coalesce(c.beneficiaire_date_naissance, '') as benef_naissance,
	coalesce(public.normalise_recherche(c.beneficiaire_nom), '') as benef_nom_naissance,
	nullif(public.normalise_recherche(c.beneficiaire_nom_usage), '') as benef_nom_usage,
	coalesce(split_part(public.normalise_recherche(c.beneficiaire_prenom), ' ', 1), '') as prenom_1,
	coalesce(split_part(public.normalise_recherche(c.beneficiaire_prenom), ' ', 2), '') as prenom_2,
	nullif(public.normalise_date_recherche(c.allocataire_date_naissance), '') as alloc_naissance,
	nullif(btrim(c.allocataire_qualite), '') as alloc_qualite,
	nullif(upper(btrim(c.beneficiaire_genre)), '') as benef_genre,
	nullif(btrim(c.code_postal), '') as code_postal
from fc_candidats c;

-- Les variantes de la clé, une ligne par candidat et par variante. La base porte UN nom par
-- moitié de clé ; le candidat en essaie deux de chaque côté, parce que les caisses ne rangent
-- pas la même nature de nom dans ces champs :
--
--   MSA  : allocataire.nom = nom de NAISSANCE   (nom_naissance_allocataire, clean_msa_lib.py)
--   CNAF : allocataire.nom = nom d'USAGE        (RESPDOS, clean_cnaf_lib.py), et NOMENF, le
--          nom de l'enfant, ne porte pas le suffixe NAI de ses noms de naissance
--
-- Côté candidat, le nom d'usage de l'allocataire vient de la réponse quotient_familial, à
-- défaut du preferred_username FranceConnect ; celui du bénéficiaire, de enfant_identite, à
-- défaut de qf_enfants — ou, sur une ligne 'self', de l'allocataire lui-même.
--
-- Le prénom de l'allocataire a lui aussi deux variantes, complet et premier seul. Il est au
-- 2e champ de la clé, donc comparé à l'égalité stricte — la seule zone préfixe est la fin,
-- occupée par les prénoms du bénéficiaire — et la CNAF n'en stocke qu'un seul (PRENOMDOS).
--
-- 2 × 2 × 2 = 8 variantes au plus. Une variante dont le nom d'usage manque n'est pas
-- générée, et `distinct` fond celles qui coïncident.
create temp table fc_cles on commit drop as
select distinct
	n.eligibility_result_id,
	alloc_nom.v || '|' || alloc_prenom.v || '|' || n.benef_naissance || '|' || benef_nom.v || '|'
		as cle_stable
from fc_norm n
cross join lateral (values (n.alloc_nom_naissance), (n.alloc_nom_usage)) as alloc_nom(v)
cross join lateral (values (n.alloc_prenom), (split_part(n.alloc_prenom, ' ', 1))) as alloc_prenom(v)
cross join lateral (values (n.benef_nom_naissance), (n.benef_nom_usage)) as benef_nom(v)
where alloc_nom.v is not null
  and benef_nom.v is not null;

-- Comment compter. Chaque niveau fait `select distinct (candidat, id_psp)`, puis
-- `group by candidat having count(*) = 1` : min(id_psp) est alors le seul. Compter des
-- LIGNES serait faux — plusieurs variantes de clé atteignent souvent la même ligne de
-- beneficiaires, et un candidat parfaitement identifié passerait pour ambigu.
--
-- Comment chercher. Le préfixe s'exprime en bornes, avec ~>=~ et ~<~, les opérateurs de
-- text_pattern_ops, et non en LIKE : le motif est calculé ligne par ligne, et PostgreSQL ne
-- tire de bornes d'index d'un LIKE que si le motif est une constante. Un LIKE forcerait un
-- parcours complet de beneficiaires pour chaque candidat. chr(1114111), le plus grand
-- caractère Unicode, ferme la borne haute : toute clé qui commence par le préfixe lui est
-- inférieure.

-- --- Niveau 1 : l'INE ------------------------------------------------------------------
-- Jointure exacte, la seule de tout ce fichier : CNOUS range l'INE du boursier dans le
-- matricule de l'allocataire (beneficiaires.allocataire_matricule, indexé), et API Particulier le rend sur la route boursier. Aucun
-- équivalent n'existe pour CNAF et MSA — la réponse quotient_familial ne porte pas de
-- numéro d'allocataire.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, min(id_psp), 'ine'
from (
	select distinct n.eligibility_result_id, b.id_psp
	from fc_norm n
	join public.beneficiaires b
	  on b.allocataire_matricule = n.ine
	 and b.exercice_id = :exercice
	 and b.id_psp is not null
	where n.ine is not null
) t
group by eligibility_result_id
having count(*) = 1;

-- --- Niveau 2 : identité, sur le premier prénom -----------------------------------------
-- La clé se termine par les prénoms suivis d'un espace : chercher sur le premier prénom est
-- un préfixe, et l'espace final ferme la frontière de mot — 'ZUPRALIN ' ne rencontre jamais
-- ZUPRALINE. Tout ce que les départageurs relisent est pris ici, une fois.
create temp table fc_essai_1 on commit drop as
select distinct
	k.eligibility_result_id,
	b.id_psp,
	-- 5e segment de la clé : les prénoms du bénéficiaire ; son 2e mot est le second prénom.
	split_part(split_part(b.cle_recherche, '|', 5), ' ', 2) as prenom_2_base,
	b.genre::text as genre_base,
	b.allocataire_qualite as qualite_base,
	public.normalise_date_recherche(b.allocataire_date_naissance) as alloc_naissance_base,
	b.adresse_allocataire_code_postal as code_postal_base
from fc_cles k
join fc_norm n on n.eligibility_result_id = k.eligibility_result_id
cross join lateral (select k.cle_stable || n.prenom_1 || ' ' as prefixe) p
join public.beneficiaires b
  on b.cle_recherche ~>=~ p.prefixe
 -- Parenthèses obligatoires : ~<~ et || ont la même priorité et s'associent à gauche, sans
 -- elles la comparaison serait faite avant la concaténation.
 and b.cle_recherche ~<~ (p.prefixe || chr(1114111))
 and b.exercice_id = :exercice
 and b.id_psp is not null
where n.prenom_1 <> ''
  and not exists (select 1 from fc_apparies a
                   where a.eligibility_result_id = k.eligibility_result_id);

insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, min(id_psp), 'prenom_1'
from fc_essai_1
group by eligibility_result_id
having count(*) = 1;

-- Ceux que le premier prénom laisse ambigus : les seuls que les niveaux suivants examinent.
create temp table fc_ambigus on commit drop as
select eligibility_result_id
from fc_essai_1
group by eligibility_result_id
having count(*) > 1;

-- --- Niveau 3 : identité, sur les deux premiers prénoms ---------------------------------
-- Rechercher le préfixe allongé revient exactement à garder, parmi les lignes du niveau 2,
-- celles dont le second prénom est celui du candidat : pas besoin d'un second passage sur
-- l'index. Sans second prénom, rien ne distingue le candidat à ce niveau.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select e.eligibility_result_id, min(e.id_psp), 'prenom_2'
from fc_essai_1 e
join fc_ambigus am on am.eligibility_result_id = e.eligibility_result_id
join fc_norm n on n.eligibility_result_id = e.eligibility_result_id
where n.prenom_2 <> ''
  and e.prenom_2_base = n.prenom_2
group by e.eligibility_result_id
having count(*) = 1;

-- --- Les lignes que les départageurs peuvent examiner -----------------------------------
-- Les ambigus pas encore appariés, restreints aux lignes dont le second prénom ne CONTREDIT
-- pas celui du candidat : vide d'un côté ou de l'autre, ou identique. Sans ce filtre, un
-- candidat « TARNU ZELVIK » que le niveau 3 ne trouve pas pourrait être départagé vers une
-- ligne « TARNU BOLIMEK », que son second prénom exclut pourtant.
create temp table fc_departage on commit drop as
select e.*
from fc_essai_1 e
join fc_ambigus am on am.eligibility_result_id = e.eligibility_result_id
join fc_norm n on n.eligibility_result_id = e.eligibility_result_id
where not exists (select 1 from fc_apparies a
                   where a.eligibility_result_id = e.eligibility_result_id)
  and (n.prenom_2 = '' or e.prenom_2_base = '' or e.prenom_2_base = n.prenom_2);

-- Aucun des trois critères suivants n'est dans la clé, et c'est voulu : dans la clé, un
-- champ présent d'un côté et absent de l'autre rend la ligne introuvable. Ici ils ne font
-- que RÉTRÉCIR un ensemble déjà ambigu, et une valeur absente ne tranche simplement pas.

-- --- Niveau 4 : départage par le genre --------------------------------------------------
-- Genre du bénéficiaire, et qualité de l'allocataire (M / Mme) quand les deux côtés la
-- portent. Un seul bit d'information, et côté FranceConnect le genre de l'enfant est
-- *dérivé* par appariement dans qf_enfants — raison de plus pour ne l'utiliser qu'ici. Avant
-- le code postal : deux frères et sœurs du même foyer partagent le code postal, pas le genre.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select d.eligibility_result_id, min(d.id_psp), 'genre'
from fc_departage d
join fc_norm n on n.eligibility_result_id = d.eligibility_result_id
where n.benef_genre is not null
  and d.genre_base = n.benef_genre
  and (n.alloc_qualite is null or d.qualite_base is null or d.qualite_base = n.alloc_qualite)
group by d.eligibility_result_id
having count(*) = 1;

-- --- Niveau 5 : départage par la date de naissance de l'allocataire ---------------------
-- MSA et CNOUS la déposent dans le JSON allocataire, que l'injection aplatit en
-- beneficiaires.allocataire_date_naissance ; la CNAF non — son pipeline mappe les colonnes puis
-- les jette après l'appel qf-batch. normalise_date_recherche réconcilie l'ISO de la MSA et de
-- FranceConnect avec le JJ/MM/AAAA du CNOUS.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select d.eligibility_result_id, min(d.id_psp), 'naissance_allocataire'
from fc_departage d
join fc_norm n on n.eligibility_result_id = d.eligibility_result_id
where n.alloc_naissance is not null
  and d.alloc_naissance_base = n.alloc_naissance
  and not exists (select 1 from fc_apparies a
                   where a.eligibility_result_id = d.eligibility_result_id)
group by d.eligibility_result_id
having count(*) = 1;

-- --- Niveau 6 : départage par le code postal du foyer -----------------------------------
-- Le code postal de la réponse quotient_familial, confronté à `adresse_allocataire_code_postal`. Seul
-- reste d'adresse côté FranceConnect depuis que le parcours ne demande plus la commune de
-- résidence.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select d.eligibility_result_id, min(d.id_psp), 'code_postal'
from fc_departage d
join fc_norm n on n.eligibility_result_id = d.eligibility_result_id
where n.code_postal is not null
  and d.code_postal_base = n.code_postal
  and not exists (select 1 from fc_apparies a
                   where a.eligibility_result_id = d.eligibility_result_id)
group by d.eligibility_result_id
having count(*) = 1;

-- Un même id_psp servi à deux candidats différents signalerait un rapprochement trop lâche :
-- mieux vaut refuser le passage que distribuer deux fois le même code.
do $$
declare doublons int;
begin
	select count(*) into doublons
	from (select id_psp from fc_apparies group by id_psp having count(*) > 1) t;
	if doublons > 0 then
		raise exception 'RAPPROCHEMENT AMBIGU : % code(s) apparié(s) à plusieurs candidats', doublons;
	end if;
end $$;

-- --- Sorties ----------------------------------------------------------------------------
-- :apparies et non :'apparies' — \o prend son argument brut, les guillemets d'une
-- interpolation quotée finiraient dans le nom du fichier.

\o :apparies
copy (
	select eligibility_result_id, id_psp
	from fc_apparies
	order by eligibility_result_id
) to stdout with (format csv, header, delimiter ';');
\o

\o :non_apparies
copy (
	select c.eligibility_result_id
	from fc_candidats c
	where not exists (select 1 from fc_apparies a
	                   where a.eligibility_result_id = c.eligibility_result_id)
	order by c.eligibility_result_id
) to stdout with (format csv, header, delimiter ';');
\o

-- Ce qu'un humain lit dans le journal de la cron : combien par niveau, combien d'homonymes
-- que rien n'a su départager, et combien restent.
select
	(select count(*) from fc_candidats) as candidats,
	(select count(*) from fc_apparies where niveau = 'ine') as par_ine,
	(select count(*) from fc_apparies where niveau = 'prenom_1') as par_prenom_1,
	(select count(*) from fc_apparies where niveau = 'prenom_2') as par_prenom_2,
	(select count(*) from fc_apparies where niveau = 'genre') as par_genre,
	(select count(*) from fc_apparies where niveau = 'naissance_allocataire')
		as par_naissance_allocataire,
	(select count(*) from fc_apparies where niveau = 'code_postal') as par_code_postal,
	(select count(*) from fc_ambigus am
	  where not exists (select 1 from fc_apparies a
	                     where a.eligibility_result_id = am.eligibility_result_id))
		as ambigus_non_departages,
	(select count(*) from fc_candidats c
	  where not exists (select 1 from fc_apparies a
	                     where a.eligibility_result_id = c.eligibility_result_id)) as non_apparies;

commit;
