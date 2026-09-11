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
-- UNE STRATÉGIE PAR (SITUATION, CAISSE), parce que les caisses n'écrivent pas les mêmes
-- champs en base, ni la même nature de nom :
--
--   boursier   INE exact (beneficiaires.allocataire_matricule)
--   AAH        bénéficiaire seul ; nom de NAISSANCE côté MSA, nom d'USAGE côté CAF —
--              et la caisse est indéterminable depuis l'API (aucun appel quotient_familial
--              sur cette route), donc les DEUX stratégies sont essayées
--   AEEH       allocataire + bénéficiaire ; côté MSA le nom de naissance et la date de
--              naissance de l'allocataire, côté CAF le nom d'usage (RESPDOS) sans date
--   jeune (QF) allocataire + bénéficiaire, sur le nom de NAISSANCE de l'allocataire des
--              deux côtés — la CNAF le porte dans beneficiaire_cnaf_extra_field, rempli
--              pour les lignes d'origine ARS uniquement
--
-- Les prénoms venus de la base LAMP doivent être CONTENUS dans les prénoms FranceConnect :
-- sous-ensemble de mots, ordre libre (opérateur <@ sur les tableaux de mots normalisés).
-- La CNAF ne stocke qu'un prénom (PRENOMDOS, NOMENF), FranceConnect les porte tous.
--
-- VERDICT STRICT : un candidat est apparié ssi sa stratégie retourne exactement UN id_psp.
-- Zéro ou plusieurs lignes = non apparié -> il recevra un code neuf, le moins risqué des
-- deux. Aucun départageur. Pour l'AAH : exactement une des deux stratégies retourne
-- exactement une ligne et l'autre aucune — deux stratégies à une ligne, même identique,
-- restent inconcluantes.

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

-- Tout en text : les comparaisons se font sur du texte normalisé, et une colonne typée
-- ferait échouer le \copy sur les valeurs vides que le producteur écrit pour un champ
-- absent.
create temp table fc_candidats (
	eligibility_result_id text not null,
	situation text,
	organisme text,
	ine text,
	allocataire_nom text,
	allocataire_nom_usage text,
	allocataire_prenom text,
	allocataire_date_naissance text,
	allocataire_qualite text,
	allocataire_genre text,
	beneficiaire_nom text,
	beneficiaire_nom_usage text,
	beneficiaire_prenom text,
	beneficiaire_date_naissance text,
	beneficiaire_genre text
) on commit drop;

-- `header match` : l'en-tête du fichier doit nommer exactement ces colonnes, dans cet ordre.
-- Sans lui, COPY chargerait par position, et une colonne ajoutée à clean_fc_lib.MATCH_COLUMNS
-- sans l'être ici décalerait silencieusement tout le fichier.
\copy fc_candidats (eligibility_result_id, situation, organisme, ine, allocataire_nom, allocataire_nom_usage, allocataire_prenom, allocataire_date_naissance, allocataire_qualite, allocataire_genre, beneficiaire_nom, beneficiaire_nom_usage, beneficiaire_prenom, beneficiaire_date_naissance, beneficiaire_genre) from 'fc_2026_match_candidates.csv' with (format csv, header match, delimiter ';')

-- Chaque candidat, normalisé UNE fois, par les mêmes fonctions que celles appliquées côté
-- base dans les jointures plus bas : c'est ce qui garantit que les deux côtés de la
-- comparaison s'écrivent pareil. Les champs absents restent NULL — un critère dont le
-- candidat n'a pas la valeur ne peut pas apparier.
--
-- Les prénoms deviennent des TABLEAUX de mots : le containment « prénoms LAMP contenus
-- dans les prénoms FranceConnect » s'écrit alors base_prenoms <@ fc_prenoms, ordre libre.
create temp table fc_norm on commit drop as
select
	c.eligibility_result_id,
	nullif(btrim(c.situation), '') as situation,
	nullif(btrim(c.organisme), '') as organisme,
	nullif(btrim(c.ine), '') as ine,
	nullif(public.normalise_recherche(c.allocataire_nom), '') as alloc_nom_naissance,
	nullif(public.normalise_recherche(c.allocataire_nom_usage), '') as alloc_nom_usage,
	string_to_array(nullif(public.normalise_recherche(c.allocataire_prenom), ''), ' ')
		as alloc_prenoms,
	nullif(public.normalise_date_recherche(c.allocataire_date_naissance), '')
		as alloc_naissance,
	nullif(btrim(c.allocataire_qualite), '') as alloc_qualite,
	-- 'male'/'female', le vocabulaire du pivot, que cnaf_allocataire_genre partage.
	nullif(lower(btrim(c.allocataire_genre)), '') as alloc_genre,
	nullif(public.normalise_recherche(c.beneficiaire_nom), '') as benef_nom_naissance,
	nullif(public.normalise_recherche(c.beneficiaire_nom_usage), '') as benef_nom_usage,
	-- Les deux formes : le texte pour l'égalité stricte (AEEH), le tableau pour le
	-- containment (AAH, jeune).
	nullif(public.normalise_recherche(c.beneficiaire_prenom), '') as benef_prenoms_texte,
	string_to_array(nullif(public.normalise_recherche(c.beneficiaire_prenom), ''), ' ')
		as benef_prenoms,
	nullif(btrim(c.beneficiaire_date_naissance), '')::date as benef_naissance,
	nullif(upper(btrim(c.beneficiaire_genre)), '') as benef_genre
from fc_candidats c;

-- Toutes les lignes de base que chaque stratégie atteint, avant verdict : c'est sur cette
-- table que se comptent les « exactement un id_psp » et les inconcluants du récap. `distinct`
-- parce que compter des LIGNES serait faux — le même id_psp atteint par deux chemins (nom de
-- naissance ET nom d'usage identiques, par exemple) ne fait qu'une personne.
create temp table fc_essais (
	eligibility_result_id text not null,
	id_psp text not null,
	strategie text not null
) on commit drop;

create temp table fc_apparies (
	eligibility_result_id text not null,
	id_psp text not null,
	strategie text not null
) on commit drop;

-- --- boursier : l'INE ------------------------------------------------------------------
-- Jointure exacte, la seule de tout ce fichier : CNOUS range l'INE du boursier dans le
-- matricule de l'allocataire (beneficiaires.allocataire_matricule, indexé), et API
-- Particulier le rend sur la route boursier.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'boursier'
from fc_norm n
join public.beneficiaires b
  on b.allocataire_matricule = n.ine
 and b.organisme = 'cnous'
 and b.situation = 'boursier'
 and b.exercice_id = :exercice
 and b.id_psp is not null
where n.situation = 'boursier'
  and n.ine is not null;

-- --- AAH, stratégie MSA : le nom de naissance du bénéficiaire ---------------------------
-- Le bénéficiaire est l'allocataire lui-même (ligne 'self'). La MSA écrit son nom de
-- naissance dans beneficiaires.nom ; côté FranceConnect c'est le family_name du pivot.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'aah_msa'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.nom) = n.benef_nom_naissance
 and b.organisme = 'MSA'
 and b.situation = 'AAH'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and b.date_naissance::date = n.benef_naissance
 and b.genre::text = n.benef_genre
 and string_to_array(public.normalise_recherche(b.prenom), ' ') <@ n.benef_prenoms
where n.situation = 'AAH'
  and n.benef_nom_naissance is not null
  and n.benef_naissance is not null
  and n.benef_genre is not null
  and n.benef_prenoms is not null;

-- --- AAH, stratégie CAF : le nom d'usage du bénéficiaire --------------------------------
-- La CNAF range un nom d'usage dans beneficiaires.nom ; côté FranceConnect le seul nom
-- d'usage disponible sur cette route est le preferred_username du pivot (aucun appel
-- quotient_familial). Sans lui, la stratégie ne retourne rien.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'aah_caf'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.nom) = n.benef_nom_usage
 and b.organisme = 'CAF'
 and b.situation = 'AAH'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and b.date_naissance::date = n.benef_naissance
 and b.genre::text = n.benef_genre
 and string_to_array(public.normalise_recherche(b.prenom), ' ') <@ n.benef_prenoms
where n.situation = 'AAH'
  and n.benef_nom_usage is not null
  and n.benef_naissance is not null
  and n.benef_genre is not null
  and n.benef_prenoms is not null;

-- --- AEEH, caisse MSA -------------------------------------------------------------------
-- Allocataire : nom de naissance, prénoms contenus, qualité (M/Mme, le seul « genre » que
-- les partenaires écrivent en base pour l'allocataire) et date de naissance — la MSA la
-- porte, contrairement à la CNAF. Bénéficiaire : identité complète, en égalité stricte.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'aeeh_msa'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.allocataire_nom) = n.alloc_nom_naissance
 and b.organisme = 'MSA'
 and b.situation = 'AEEH'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and string_to_array(public.normalise_recherche(b.allocataire_prenom), ' ') <@ n.alloc_prenoms
 and b.allocataire_qualite = n.alloc_qualite
 and public.normalise_date_recherche(b.allocataire_date_naissance) = n.alloc_naissance
 and public.normalise_recherche(b.nom) = n.benef_nom_naissance
 and public.normalise_recherche(b.prenom) = n.benef_prenoms_texte
 and b.genre::text = n.benef_genre
 and b.date_naissance::date = n.benef_naissance
where n.situation = 'AEEH'
  and n.organisme = 'MSA'
  and n.alloc_nom_naissance is not null
  and n.alloc_prenoms is not null
  and n.alloc_qualite is not null
  and n.alloc_naissance is not null
  and n.benef_nom_naissance is not null
  and n.benef_prenoms_texte is not null
  and n.benef_genre is not null
  and n.benef_naissance is not null;

-- --- AEEH, caisse CAF -------------------------------------------------------------------
-- Allocataire : nom d'USAGE (RESPDOS) et pas de date de naissance — la CNAF ne sérialise ni
-- l'un ni l'autre pour l'AEEH, et beneficiaire_cnaf_extra_field n'est rempli que pour les
-- lignes d'origine ARS. Bénéficiaire : NOMENF ne porte pas le suffixe NAI des noms de
-- naissance CNAF, le nom du candidat est donc accepté sous ses deux formes.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'aeeh_caf'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.allocataire_nom) = n.alloc_nom_usage
 and b.organisme = 'CAF'
 and b.situation = 'AEEH'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and string_to_array(public.normalise_recherche(b.allocataire_prenom), ' ') <@ n.alloc_prenoms
 and b.allocataire_qualite = n.alloc_qualite
 and public.normalise_recherche(b.nom) in (n.benef_nom_naissance, n.benef_nom_usage)
 and public.normalise_recherche(b.prenom) = n.benef_prenoms_texte
 and b.genre::text = n.benef_genre
 and b.date_naissance::date = n.benef_naissance
where n.situation = 'AEEH'
  and n.organisme = 'CAF'
  and n.alloc_nom_usage is not null
  and n.alloc_prenoms is not null
  and n.alloc_qualite is not null
  and n.benef_nom_naissance is not null
  and n.benef_prenoms_texte is not null
  and n.benef_genre is not null
  and n.benef_naissance is not null;

-- --- jeune (QF), caisse MSA -------------------------------------------------------------
-- Même bloc allocataire que l'AEEH MSA ; bénéficiaire en containment de prénoms — la règle
-- QF le demande explicitement, là où l'AEEH exige l'égalité.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'qf_msa'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.allocataire_nom) = n.alloc_nom_naissance
 and b.organisme = 'MSA'
 and b.situation = 'jeune'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and string_to_array(public.normalise_recherche(b.allocataire_prenom), ' ') <@ n.alloc_prenoms
 and b.allocataire_qualite = n.alloc_qualite
 and public.normalise_date_recherche(b.allocataire_date_naissance) = n.alloc_naissance
 and public.normalise_recherche(b.nom) = n.benef_nom_naissance
 and string_to_array(public.normalise_recherche(b.prenom), ' ') <@ n.benef_prenoms
 and b.genre::text = n.benef_genre
 and b.date_naissance::date = n.benef_naissance
where n.situation = 'jeune'
  and n.organisme = 'MSA'
  and n.alloc_nom_naissance is not null
  and n.alloc_prenoms is not null
  and n.alloc_qualite is not null
  and n.alloc_naissance is not null
  and n.benef_nom_naissance is not null
  and n.benef_prenoms is not null
  and n.benef_genre is not null
  and n.benef_naissance is not null;

-- --- jeune (QF), caisse CAF -------------------------------------------------------------
-- Le nom de NAISSANCE, le genre et la date de naissance de l'allocataire viennent de
-- beneficiaire_cnaf_extra_field — remplis par reconcile_cnaf pour les lignes d'origine ARS,
-- précisément la population QF. cnaf_allocataire_genre partage le vocabulaire du pivot
-- ('male'/'female'), d'où alloc_genre plutôt que la qualité. Le prénom de l'allocataire
-- reste PRENOMDOS, dans beneficiaires.
insert into fc_essais (eligibility_result_id, id_psp, strategie)
select distinct n.eligibility_result_id, b.id_psp, 'qf_caf'
from fc_norm n
join public.beneficiaires b
  on public.normalise_recherche(b.nom) in (n.benef_nom_naissance, n.benef_nom_usage)
 and b.organisme = 'CAF'
 and b.situation = 'jeune'
 and b.exercice_id = :exercice
 and b.id_psp is not null
 and string_to_array(public.normalise_recherche(b.allocataire_prenom), ' ') <@ n.alloc_prenoms
 and string_to_array(public.normalise_recherche(b.prenom), ' ') <@ n.benef_prenoms
 and b.genre::text = n.benef_genre
 and b.date_naissance::date = n.benef_naissance
join public.beneficiaire_cnaf_extra_field x
  on x.id_psp = b.id_psp
 and public.normalise_recherche(x.cnaf_allocataire_nom_naissance) = n.alloc_nom_naissance
 and lower(btrim(x.cnaf_allocataire_genre)) = n.alloc_genre
 and x.cnaf_allocataire_date_naissance = n.alloc_naissance::date
where n.situation = 'jeune'
  and n.organisme = 'CAF'
  and n.alloc_nom_naissance is not null
  and n.alloc_prenoms is not null
  and n.alloc_genre is not null
  and n.alloc_naissance is not null
  and n.benef_nom_naissance is not null
  and n.benef_prenoms is not null
  and n.benef_genre is not null
  and n.benef_naissance is not null;

-- --- Verdicts ---------------------------------------------------------------------------

-- Hors AAH, un candidat ne relève que d'une stratégie (sa situation et sa caisse la
-- choisissent) : concluant ssi elle atteint exactement un id_psp.
insert into fc_apparies (eligibility_result_id, id_psp, strategie)
select eligibility_result_id, min(id_psp), min(strategie)
from fc_essais
where strategie not in ('aah_msa', 'aah_caf')
group by eligibility_result_id
having count(distinct id_psp) = 1;

-- AAH : les deux stratégies ont été essayées. Concluant ssi exactement UNE des deux
-- retourne exactement une ligne et l'autre aucune. Deux stratégies à une ligne — même la
-- même — restent inconcluantes.
insert into fc_apparies (eligibility_result_id, id_psp, strategie)
select
	eligibility_result_id,
	case when coalesce(m.nb, 0) = 1 then m.seul else f.seul end,
	case when coalesce(m.nb, 0) = 1 then 'aah_msa' else 'aah_caf' end
from (
	select eligibility_result_id, count(distinct id_psp) as nb, min(id_psp) as seul
	from fc_essais where strategie = 'aah_msa' group by eligibility_result_id
) m
full join (
	select eligibility_result_id, count(distinct id_psp) as nb, min(id_psp) as seul
	from fc_essais where strategie = 'aah_caf' group by eligibility_result_id
) f using (eligibility_result_id)
where (coalesce(m.nb, 0) = 1 and coalesce(f.nb, 0) = 0)
   or (coalesce(m.nb, 0) = 0 and coalesce(f.nb, 0) = 1);

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

-- Ce qu'un humain lit dans le journal de la cron : combien par stratégie, combien
-- d'inconcluants (des lignes atteintes, mais pas exactement une), et combien restent.
select
	(select count(*) from fc_candidats) as candidats,
	(select count(*) from fc_apparies where strategie = 'boursier') as par_boursier,
	(select count(*) from fc_apparies where strategie = 'aah_msa') as par_aah_msa,
	(select count(*) from fc_apparies where strategie = 'aah_caf') as par_aah_caf,
	(select count(*) from fc_apparies where strategie = 'aeeh_msa') as par_aeeh_msa,
	(select count(*) from fc_apparies where strategie = 'aeeh_caf') as par_aeeh_caf,
	(select count(*) from fc_apparies where strategie = 'qf_msa') as par_qf_msa,
	(select count(*) from fc_apparies where strategie = 'qf_caf') as par_qf_caf,
	(select count(distinct e.eligibility_result_id) from fc_essais e
	  where not exists (select 1 from fc_apparies a
	                     where a.eligibility_result_id = e.eligibility_result_id))
		as inconcluants,
	(select count(*) from fc_candidats c
	  where not exists (select 1 from fc_apparies a
	                     where a.eligibility_result_id = c.eligibility_result_id)) as non_apparies;

commit;
