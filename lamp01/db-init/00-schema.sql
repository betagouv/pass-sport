-- Schema of the beneficiary database, loaded by both ../compose.yml (the real prod and
-- integration services) and the injection test bench, so the two can never drift apart.
--
-- Mirrors the production DDL, which cannot be applied as-is for one remaining reason
-- (a second one, missing enum types, used to apply too -- the production dump now carries
-- its own CREATE TYPE statements, kept in sync with the ones below):
--
--   1. Its expression indexes were rendered by a GUI tool as quoted identifiers --
--      ("(allocataire ->> 'matricule'::text)") names a *column* of that name, which does
--      not exist, so those CREATE INDEX statements error out. They are written as real
--      expressions here.

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
	allocataire json NULL,
	adresse_allocataire json NULL,
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
CREATE INDEX beneficiaires_allocataire_matricule ON public.beneficiaires ((allocataire ->> 'matricule'));
CREATE INDEX beneficiaires_expr_idx ON public.beneficiaires ((allocataire ->> 'courriel'));
CREATE INDEX beneficiaires_nom_idx ON public.beneficiaires (nom);
CREATE INDEX beneficiaires_refuser_idx ON public.beneficiaires (refuser);
CREATE INDEX i_datenaissance ON public.beneficiaires (date_naissance);
CREATE INDEX i_global ON public.beneficiaires (nom, prenom, date_naissance, (adresse_allocataire ->> 'code_insee'));
CREATE INDEX i_id_psp ON public.beneficiaires (id_psp);
CREATE INDEX i_nom ON public.beneficiaires (nom);
CREATE INDEX i_prenom ON public.beneficiaires (prenom);
CREATE INDEX idx_beneficiaires_exercice_id_qpv ON public.beneficiaires (exercice_id, qpv);
CREATE INDEX idx_beneficiaires_exercice_id_zrr ON public.beneficiaires (exercice_id, zrr);
CREATE INDEX idx_beneficiaires_nom_trgm ON public.beneficiaires (nom);
CREATE INDEX idx_beneficiaires_prenom_trgm ON public.beneficiaires (prenom);
CREATE INDEX idx_exercice_id ON public.beneficiaires (exercice_id);
CREATE INDEX json_field_btree_index ON public.beneficiaires ((adresse_allocataire ->> 'code_insee'));

-- ---------------------------------------------------------------------------------------
-- Search key
--
-- Answers one question: is the person a FranceConnect run just judged eligible already in
-- this table, carrying an id_psp? The FranceConnect path no longer calls LCA, so this
-- lookup is what replaces it (data/2026/partners/franceconnect/match_beneficiaires.sql).
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

-- Reconciles the two shapes an allocataire birthdate takes in the JSON: ISO from MSA and
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
-- columns, then drops them after the qf-batch call), and rows already in the table carry
-- nothing at all. A key field present on one side and absent on the other makes the row
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
	nom text, prenom text, date_naissance timestamp, allocataire json
) RETURNS text
	LANGUAGE sql IMMUTABLE PARALLEL SAFE
	AS $$
		SELECT public.normalise_recherche(coalesce(allocataire ->> 'nom', ''))    || '|'
		    || public.normalise_recherche(coalesce(allocataire ->> 'prenom', '')) || '|'
		    || coalesce(
		           lpad(extract(year  FROM date_naissance)::int::text, 4, '0') || '-' ||
		           lpad(extract(month FROM date_naissance)::int::text, 2, '0') || '-' ||
		           lpad(extract(day   FROM date_naissance)::int::text, 2, '0'), '')  || '|'
		    || public.normalise_recherche(coalesce(nom, ''))                      || '|'
		    || public.normalise_recherche(coalesce(prenom, '')) || ' '
	$$;

ALTER TABLE public.beneficiaires ADD COLUMN cle_recherche text
	GENERATED ALWAYS AS (
		public.cle_recherche_beneficiaire(nom, prenom, date_naissance, allocataire)
	) STORED;

-- text_pattern_ops so LIKE 'prefix%' is index-served whatever the database collation.
CREATE INDEX beneficiaires_cle_recherche_idx
	ON public.beneficiaires (cle_recherche text_pattern_ops);
