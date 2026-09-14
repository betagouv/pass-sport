-- Schema of the lamp01 beneficiary database, loaded by both services of ../compose.yml
-- (integration and prod).
--
-- Derived from the production DDL with one deliberate difference: production stores the
-- allocataire and its address as two JSON columns, `allocataire` and `adresse_allocataire`;
-- here every key of those JSON objects has its own column, allocataire_<key> and
-- adresse_allocataire_<key>. The partner CSVs still carry the JSON - ../inject_csv.sh
-- flattens it at load time, and refuses a key that has no column below rather than losing
-- it. Of production's indexes, only those match_beneficiaires.sql uses are kept.
--
-- The automatic injector's test bench, which writes into production, keeps its own frozen
-- copy of the production DDL instead of this file.

CREATE TYPE public.beneficiaire_genre AS ENUM ('M', 'F');

CREATE TYPE public.organisme AS ENUM ('CAF', 'MSA', 'cnous');

CREATE TYPE public.situation AS ENUM ('jeune', 'AAH', 'AEEH', 'boursier');

-- Minimal stand-in for the real table: only the primary key matters here, as the target
-- of the beneficiaires_exercice_id_foreign constraint.
CREATE TABLE public.exercices (
	id serial4 NOT NULL,
	libelle varchar(255) NULL,
	CONSTRAINT exercices_pkey PRIMARY KEY (id)
);

-- The CSVs produced by the FranceConnect pipeline carry exercice_id = 5.
INSERT INTO public.exercices (id, libelle) VALUES (5, 'exercice de test');
SELECT setval('public.exercices_id_seq', 5);

CREATE TABLE public.beneficiaires (
	id serial4 NOT NULL,
	id_psp varchar(255) NULL,
	nom varchar(255) NULL,
	prenom varchar(255) NULL,
	date_naissance timestamp NULL,
	genre public."beneficiaire_genre" NULL,
	"organisme" public."organisme" NULL,
	"situation" public."situation" NULL,
	-- partners_lib.to_json_allocataire_without_null, the core every partner writes
	allocataire_qualite varchar(255) NULL,
	allocataire_matricule varchar(255) NULL,
	allocataire_code_organisme varchar(255) NULL,
	allocataire_telephone varchar(255) NULL,
	allocataire_nom varchar(255) NULL,
	allocataire_prenom varchar(255) NULL,
	allocataire_courriel varchar(255) NULL,
	-- The allocataire's birth details, from the partners that serialise them (the
	-- ALLOCATAIRE_JSON_EXTRA_FIELDS of clean_msa_lib and clean_cnous_lib, fc_pipeline's
	-- ALLOCATAIRE_EXTRA_FIELDS). Text, not date: ISO from MSA and FC, %d/%m/%Y from CNOUS --
	-- normalise_date_recherche below reconciles the two.
	allocataire_date_naissance varchar(255) NULL,
	allocataire_commune_naissance varchar(255) NULL,
	allocataire_code_insee_commune_naissance varchar(255) NULL,
	allocataire_pays_naissance varchar(255) NULL,
	allocataire_code_iso_pays_naissance varchar(255) NULL,
	allocataire_code_pays_naissance varchar(255) NULL,
	-- partners_lib.to_json_adresse_without_null, plus MSA's nom_adresse_postale
	adresse_allocataire_voie varchar(255) NULL,
	adresse_allocataire_code_postal varchar(255) NULL,
	adresse_allocataire_commune varchar(255) NULL,
	adresse_allocataire_code_insee varchar(255) NULL,
	adresse_allocataire_cplt_adresse varchar(255) NULL,
	adresse_allocataire_nom_adresse_postale varchar(255) NULL,
	created_at timestamptz NULL,
	updated_at timestamptz NULL,
	qpv bool NULL,
	a_valider bool NULL,
	exercice_id int4 NULL,
	zrr bool NULL,
	uuid_doc uuid NULL,
	refuser bool DEFAULT false NULL,
	CONSTRAINT beneficiaires_id_psp_unique UNIQUE (id_psp),
	CONSTRAINT beneficiaires_pkey PRIMARY KEY (id),
	CONSTRAINT beneficiaires_uuid_doc_unique UNIQUE (uuid_doc)
);

ALTER TABLE public.beneficiaires ADD CONSTRAINT beneficiaires_exercice_id_foreign
	FOREIGN KEY (exercice_id) REFERENCES public.exercices(id);

-- ---------------------------------------------------------------------------------------
-- Normalisation shared by both sides of match_beneficiaires.sql
--
-- IMMUTABLE because the expression indexes at the bottom of this file demand it, which
-- also rules out the unaccent extension: its result depends on a dictionary the planner
-- may not assume constant. translate() does the same job on the Latin-1 letters that
-- actually occur in French civil-status records.
-- ---------------------------------------------------------------------------------------

-- Same rule the partner pipelines already apply before insert (utils.data_utils
-- unaccent_and_upper): no accents, upper case, whitespace collapsed. Apostrophes are
-- dropped and hyphens become spaces, so N'GUYEN and NGUYEN, JEAN-PIERRE and JEAN PIERRE
-- all reduce to one spelling -- the two sides of the match write them differently.
-- Everything outside [A-Z0-9 ] is then removed, leaving space as the only word separator
-- the prénoms containment splits on.
CREATE FUNCTION public.normalise_recherche(valeur text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
	AS $$
		SELECT btrim(regexp_replace(
			regexp_replace(
				upper(translate(
					replace(valeur, '''', ''),
					'àáâäãåçèéêëìíîïñòóôöõùúûüýÿÀÁÂÄÃÅÇÈÉÊËÌÍÎÏÑÒÓÔÖÕÙÚÛÜÝ-',
					'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY ')),
				'[^A-Z0-9 ]', '', 'g'),
			'\s+', ' ', 'g'))
	$$;

-- Reconciles the two shapes allocataire_date_naissance takes: ISO from MSA and
-- from the FranceConnect pipeline, %d/%m/%Y from CNOUS
-- (clean_cnous_lib.normalize_allocataire_birthdate). Same rule as
-- clean_fc_lib._to_iso_birthdate. Anything unparsable yields '' rather than an error.
CREATE FUNCTION public.normalise_date_recherche(valeur text) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE
	AS $$
		SELECT CASE
			WHEN valeur ~ '^\d{4}-\d{2}-\d{2}' THEN left(valeur, 10)
			WHEN valeur ~ '^\d{2}/\d{2}/\d{4}$'
				THEN substr(valeur, 7, 4) || '-' || substr(valeur, 4, 2) || '-' || substr(valeur, 1, 2)
			ELSE ''
		END
	$$;

-- ---------------------------------------------------------------------------------------
-- Matching indexes
--
-- The only indexes this database carries: its sole reader is match_beneficiaires.sql,
-- which runs one query per (situation, caisse), each anchored on one equality. Three
-- anchors exist: the INE (boursier, on allocataire_matricule), the beneficiary's
-- normalised name (AAH, qf_caf) and the allocataire's normalised name (AEEH, qf_msa).
-- The name anchors lead with the exercice/organisme/situation filter every strategy
-- applies. The qf_caf join into beneficiaire_cnaf_extra_field goes through its primary
-- key.
-- ---------------------------------------------------------------------------------------

CREATE INDEX beneficiaires_allocataire_matricule_idx ON public.beneficiaires (allocataire_matricule);

CREATE INDEX beneficiaires_match_nom_idx ON public.beneficiaires
	(exercice_id, organisme, situation, (public.normalise_recherche(nom)));

CREATE INDEX beneficiaires_match_allocataire_nom_idx ON public.beneficiaires
	(exercice_id, organisme, situation, (public.normalise_recherche(allocataire_nom)));
