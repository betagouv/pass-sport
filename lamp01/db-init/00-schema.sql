-- Schema of the lamp01 beneficiary database, loaded by both services of ../compose.yml
-- (integration and prod).
--
-- Derived from the production DDL with one deliberate difference: production stores the
-- allocataire and its address as two JSON columns, `allocataire` and `adresse_allocataire`;
-- here every key of those JSON objects has its own column, allocataire_<key> and
-- adresse_allocataire_<key>. The partner CSVs still carry the JSON - ../inject_csv.sh
-- flattens it at load time, and refuses a key that has no column below rather than losing
-- it. The expression indexes production builds on the JSON are gone with it.
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

CREATE INDEX beneficiaires_a_valider_idx ON public.beneficiaires (a_valider);
-- The exact INE join of match_beneficiaires.sql's first level.
CREATE INDEX beneficiaires_allocataire_matricule_idx ON public.beneficiaires (allocataire_matricule);
CREATE INDEX beneficiaires_nom_idx ON public.beneficiaires (nom);
CREATE INDEX beneficiaires_refuser_idx ON public.beneficiaires (refuser);
CREATE INDEX i_datenaissance ON public.beneficiaires (date_naissance);
CREATE INDEX i_id_psp ON public.beneficiaires (id_psp);
CREATE INDEX i_nom ON public.beneficiaires (nom);
CREATE INDEX i_prenom ON public.beneficiaires (prenom);
CREATE INDEX idx_beneficiaires_exercice_id_qpv ON public.beneficiaires (exercice_id, qpv);
CREATE INDEX idx_beneficiaires_exercice_id_zrr ON public.beneficiaires (exercice_id, zrr);
CREATE INDEX idx_beneficiaires_nom_trgm ON public.beneficiaires (nom);
CREATE INDEX idx_beneficiaires_prenom_trgm ON public.beneficiaires (prenom);
CREATE INDEX idx_exercice_id ON public.beneficiaires (exercice_id);

-- ---------------------------------------------------------------------------------------
-- Search key (legacy)
--
-- Answers one question: is the person a FranceConnect run just judged eligible already in
-- this table, carrying an id_psp? match_beneficiaires.sql used to serve that question with
-- a prefix search over this key; it now runs one query per (situation, caisse) against the
-- per-strategy indexes below, and no longer reads cle_recherche. The column, its functions
-- and its index are kept until a dedicated removal -- the production DDL carries them too.
-- normalise_recherche and normalise_date_recherche themselves are still very much alive:
-- the per-strategy matching normalises both sides with them.
--
-- Everything below is IMMUTABLE because a generated column demands it, which also rules
-- out the unaccent extension: its result depends on a dictionary the planner may not
-- assume constant. translate() does the same job on the Latin-1 letters that actually
-- occur in French civil-status records.
-- ---------------------------------------------------------------------------------------

-- Same rule the partner pipelines already apply before insert (utils.data_utils
-- unaccent_and_upper): no accents, upper case, whitespace collapsed. Apostrophes are
-- dropped and hyphens become spaces, so N'GUYEN and NGUYEN, JEAN-PIERRE and JEAN PIERRE
-- all reduce to one spelling -- the two sides of the match write them differently.
--
-- Everything outside [A-Z0-9 ] is then removed, which is what keeps the key trustworthy:
-- a '|' in a surname would forge a field boundary, and a '%' or '_' would turn the caller's
-- LIKE pattern into a wildcard matching people it should not.
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
--
-- Not part of the key -- see below -- but used by match_beneficiaires.sql to break a tie
-- between homonyms.
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

-- The key itself, and the ONLY place the searched column set is written down.
--
-- The allocataire contributes nom and prenom only. Its birthdate and birthplace -- the
-- other three of the five identity traits -- are deliberately left out even though MSA and
-- CNOUS do carry them: CNAF does not serialise them into the JSON (its pipeline maps the
-- columns, then drops them after the qf-batch call; the reconciled CNAF file only puts them
-- in beneficiaire_cnaf_extra_field, and for ARS-origin rows alone). A key field present on one side and absent on the other makes the row
-- INVISIBLE rather than merely less precise, so adding one can only lose matches.
--
-- Their place is as a tie-breaker instead, which only ever narrows an already ambiguous
-- set -- that is what match_beneficiaires.sql uses normalise_date_recherche for.
--
-- Field order is not cosmetic: the beneficiary's prénoms come LAST and are followed by a
-- space, which is what makes the caller's escalation a prefix search served by the index --
-- one given name, then two when one is ambiguous:
--
--   cle_recherche LIKE <stable> || 'ZUPRALIN '         || '%'
--   cle_recherche LIKE <stable> || 'ZUPRALIN KEDOSA '  || '%'
--
-- The trailing space closes the word boundary, so 'ZUPRALIN ' never matches ZUPRALINE.
--
-- extract() rather than to_char(): to_char(timestamp, text) is only STABLE, its output
-- depending on lc_time, and a generated column will not accept it.
--
-- CHANGING THIS SET: a generated column is not recomputed when the function behind it
-- changes, and the function cannot be replaced while a column depends on it. The sequence
-- is DROP the column, CREATE OR REPLACE this function, ADD the column back -- the STORED
-- values are recomputed by the ALTER, then rebuild the index.
CREATE FUNCTION public.cle_recherche_beneficiaire(
	nom text, prenom text, date_naissance timestamp, allocataire_nom text, allocataire_prenom text
) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE
	AS $$
		SELECT public.normalise_recherche(coalesce(allocataire_nom, ''))      || '|'
		    || public.normalise_recherche(coalesce(allocataire_prenom, ''))   || '|'
		    || coalesce(
		           lpad(extract(year  FROM date_naissance)::int::text, 4, '0') || '-' ||
		           lpad(extract(month FROM date_naissance)::int::text, 2, '0') || '-' ||
		           lpad(extract(day   FROM date_naissance)::int::text, 2, '0'), '')  || '|'
		    || public.normalise_recherche(coalesce(nom, ''))                      || '|'
		    || public.normalise_recherche(coalesce(prenom, '')) || ' '
	$$;

ALTER TABLE public.beneficiaires ADD COLUMN cle_recherche text
	GENERATED ALWAYS AS (
		public.cle_recherche_beneficiaire(
			nom, prenom, date_naissance, allocataire_nom, allocataire_prenom)
	) STORED;

-- text_pattern_ops so LIKE 'prefix%' is index-served whatever the database collation.
CREATE INDEX beneficiaires_cle_recherche_idx
	ON public.beneficiaires (cle_recherche text_pattern_ops);

-- ---------------------------------------------------------------------------------------
-- Per-strategy matching indexes
--
-- match_beneficiaires.sql now runs one query per (situation, caisse), each anchored on an
-- equality over a normalised name plus the exercice/organisme/situation filter. Two
-- anchors exist: the beneficiary's own name (boursier joins on allocataire_matricule,
-- AAH and the CAF strategies on nom) and the allocataire's name (the MSA AEEH/QF
-- strategies). normalise_recherche is IMMUTABLE, which is what makes these expression
-- indexes legal.
-- ---------------------------------------------------------------------------------------

CREATE INDEX beneficiaires_match_nom_idx ON public.beneficiaires
	(exercice_id, organisme, situation, (public.normalise_recherche(nom)));

CREATE INDEX beneficiaires_match_allocataire_nom_idx ON public.beneficiaires
	(exercice_id, organisme, situation, (public.normalise_recherche(allocataire_nom)));
