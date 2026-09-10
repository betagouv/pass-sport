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
	beneficiaire_nom text,
	beneficiaire_prenom text,
	beneficiaire_date_naissance text,
	code_postal text
) on commit drop;

\copy fc_candidats from 'fc_2026_match_candidates.csv' with (format csv, header, delimiter ';')

create temp table fc_apparies (
	eligibility_result_id text not null,
	id_psp text not null,
	niveau text not null
) on commit drop;

-- Les deux clés possibles par candidat. Ce n'est pas une précaution vague : les deux caisses
-- ne rangent pas la même chose dans le `allocataire.nom` qui part en base —
--
--   MSA  : `nom_naissance_allocataire` -> allocataire-nom   (clean_msa_lib.py)  = naissance
--   CNAF : `RESPDOS`                   -> allocataire-nom   (clean_cnaf_lib.py) = usage
--
-- La CNAF garde même son `NOMNAIDOS` à part, dans allocataire-nom_naissance, qu'elle ne
-- sérialise pas. Une clé unique raterait donc systématiquement l'une des deux caisses.
--
-- À noter, parce que ça détonne : partout ailleurs le code ne retient que le nom de
-- naissance de la réponse quotient_familial (candidates.ts, qf-batch.ts,
-- build_psp_columns). Cette convention vaut pour CONSTRUIRE une identité pivot ; ici on
-- cherche à retrouver ce qu'un partenaire a ÉCRIT, ce qui n'est pas la même question.
--
-- Les prénoms du bénéficiaire sont découpés ici, une fois.
create temp view fc_cles as
select
	c.eligibility_result_id,
	nullif(btrim(c.ine), '') as ine,
	public.normalise_recherche(c.allocataire_nom) || '|'
		|| public.normalise_recherche(c.allocataire_prenom) || '|'
		|| c.beneficiaire_date_naissance || '|'
		|| public.normalise_recherche(c.beneficiaire_nom) || '|' as cle_naissance,
	case when public.normalise_recherche(c.allocataire_nom_usage) <> '' then
		public.normalise_recherche(c.allocataire_nom_usage) || '|'
			|| public.normalise_recherche(c.allocataire_prenom) || '|'
			|| c.beneficiaire_date_naissance || '|'
			|| public.normalise_recherche(c.beneficiaire_nom) || '|'
	end as cle_usage,
	split_part(public.normalise_recherche(c.beneficiaire_prenom), ' ', 1) as prenom_1,
	split_part(public.normalise_recherche(c.beneficiaire_prenom), ' ', 2) as prenom_2,
	nullif(public.normalise_date_recherche(c.allocataire_date_naissance), '')
		as allocataire_naissance
from fc_candidats c;

-- --- Niveau 1 : l'INE ------------------------------------------------------------------
-- Jointure exacte, la seule de tout ce fichier : CNOUS range l'INE du boursier dans
-- allocataire->>'matricule', et API Particulier le rend sur la route boursier. Aucun
-- équivalent n'existe pour CNAF et MSA — la réponse quotient_familial ne porte pas de
-- numéro d'allocataire.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, id_psp, 'ine'
from (
	select c.eligibility_result_id, b.id_psp,
	       count(*) over (partition by c.eligibility_result_id) as n
	from fc_cles c
	join public.beneficiaires b
	  on b.allocataire ->> 'matricule' = c.ine
	 and b.exercice_id = :exercice
	 and b.id_psp is not null
	where c.ine is not null
) t
where n = 1;

-- --- Niveau 2 : identité, sur le premier prénom -----------------------------------------
-- La clé se termine par les prénoms suivis d'un espace : chercher sur le premier prénom est
-- donc un préfixe, servi par beneficiaires_cle_recherche_idx. L'espace final ferme la
-- frontière de mot — 'ZUPRALIN ' ne rencontre jamais ZUPRALINE.
create temp table fc_essai_1 on commit drop as
select c.eligibility_result_id, b.id_psp,
       count(*) over (partition by c.eligibility_result_id) as n
from fc_cles c
join public.beneficiaires b
  on (b.cle_recherche like c.cle_naissance || c.prenom_1 || ' %'
      or (c.cle_usage is not null and b.cle_recherche like c.cle_usage || c.prenom_1 || ' %'))
 and b.exercice_id = :exercice
 and b.id_psp is not null
where c.prenom_1 <> ''
  and not exists (select 1 from fc_apparies a
                   where a.eligibility_result_id = c.eligibility_result_id);

insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, id_psp, 'prenom_1' from fc_essai_1 where n = 1;

-- --- Niveau 3 : identité, sur les deux premiers prénoms ---------------------------------
-- Uniquement pour les candidats que le premier prénom laissait ambigus, et seulement s'ils
-- ont un second prénom : sinon rien ne les distingue et ils restent non appariés.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, id_psp, 'prenom_2'
from (
	select c.eligibility_result_id, b.id_psp,
	       count(*) over (partition by c.eligibility_result_id) as n
	from fc_cles c
	join public.beneficiaires b
	  on (b.cle_recherche like c.cle_naissance || c.prenom_1 || ' ' || c.prenom_2 || ' %'
	      or (c.cle_usage is not null
	          and b.cle_recherche like c.cle_usage || c.prenom_1 || ' ' || c.prenom_2 || ' %'))
	 and b.exercice_id = :exercice
	 and b.id_psp is not null
	where c.prenom_2 <> ''
	  and c.eligibility_result_id in (select eligibility_result_id from fc_essai_1 where n > 1)
) t
where n = 1;

-- --- Niveau 4 : départage par la date de naissance de l'allocataire ---------------------
-- Dernier recours, pour les candidats que ni le premier ni le second prénom n'ont su
-- isoler — typiquement deux homonymes stricts dont le bénéficiaire n'a qu'un seul prénom.
--
-- Ce champ n'est PAS dans la clé, et ne peut pas y être : MSA et CNOUS le déposent dans le
-- JSON, mais CNAF ne le sérialise pas (son pipeline mappe les colonnes puis les jette après
-- l'appel qf-batch), et les lignes déjà en base n'en portent aucun. Ici il ne fait que
-- RÉTRÉCIR un ensemble déjà ambigu, ce qui est sans danger : au pire il ne tranche pas.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, id_psp, 'naissance_allocataire'
from (
	select c.eligibility_result_id, b.id_psp,
	       count(*) over (partition by c.eligibility_result_id) as n
	from fc_cles c
	join fc_essai_1 e
	  on e.eligibility_result_id = c.eligibility_result_id
	 and e.n > 1
	join public.beneficiaires b
	  on b.id_psp = e.id_psp
	 and public.normalise_date_recherche(b.allocataire ->> 'date_naissance')
	     = c.allocataire_naissance
	where c.allocataire_naissance is not null
	  and not exists (select 1 from fc_apparies a
	                   where a.eligibility_result_id = c.eligibility_result_id)
) t
where n = 1;

-- --- Niveau 5 : départage par le code postal du foyer -----------------------------------
-- Même principe et même prudence que le niveau 4, sur l'autre signal disponible : le code
-- postal que la réponse quotient_familial a donné, confronté à `adresse_allocataire`. Seul
-- reste d'adresse côté FranceConnect depuis que le parcours ne demande plus la commune de
-- résidence.
insert into fc_apparies (eligibility_result_id, id_psp, niveau)
select eligibility_result_id, id_psp, 'code_postal'
from (
	select c.eligibility_result_id, b.id_psp,
	       count(*) over (partition by c.eligibility_result_id) as n
	from fc_cles c
	join fc_candidats d on d.eligibility_result_id = c.eligibility_result_id
	join fc_essai_1 e
	  on e.eligibility_result_id = c.eligibility_result_id
	 and e.n > 1
	join public.beneficiaires b
	  on b.id_psp = e.id_psp
	 and b.adresse_allocataire ->> 'code_postal' = nullif(btrim(d.code_postal), '')
	where nullif(btrim(d.code_postal), '') is not null
	  and not exists (select 1 from fc_apparies a
	                   where a.eligibility_result_id = c.eligibility_result_id)
) t
where n = 1;

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

-- Ce qu'un humain lit dans le journal de la cron : combien par niveau, et combien restent.
select
	(select count(*) from fc_candidats) as candidats,
	(select count(*) from fc_apparies where niveau = 'ine') as par_ine,
	(select count(*) from fc_apparies where niveau = 'prenom_1') as par_prenom_1,
	(select count(*) from fc_apparies where niveau = 'prenom_2') as par_prenom_2,
	(select count(*) from fc_apparies where niveau = 'naissance_allocataire')
		as par_naissance_allocataire,
	(select count(*) from fc_apparies where niveau = 'code_postal') as par_code_postal,
	(select count(*) from fc_candidats c
	  where not exists (select 1 from fc_apparies a
	                     where a.eligibility_result_id = c.eligibility_result_id)) as non_apparies;

commit;
