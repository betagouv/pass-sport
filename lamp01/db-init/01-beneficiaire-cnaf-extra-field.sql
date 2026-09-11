-- What the CNAF export leaves out of the allocataire JSON, and
-- data/2026/partners/cnaf/reconcile_cnaf_raw_with_codes.ipynb recovers from the raw file:
-- one row per CNAF beneficiary, keyed on its code.
--
-- A side table rather than more beneficiaires columns: only the CNAF carries these, and
-- only in the reconciled file. inject_csv.sh fills both from that one CSV - its beneficiaires
-- columns (the allocataire JSON flattened) go to beneficiaires, the ones below here.
--
-- Every column is prefixed cnaf_: inject_csv.sh sends a CSV column to beneficiaires first,
-- and beneficiaires already has allocataire_date_naissance, allocataire_pays_naissance and
-- allocataire_code_pays_naissance, flattened from the keys MSA, CNOUS and FC serialise.
--
-- Loaded after 00-schema.sql on a fresh volume.
--
-- Values keep the shape the notebook writes: ISO date, COG codes, genre as 'male'/'female'
-- (the quotient_familial API's, not beneficiaires.genre's M/F). AAH and AEEH rows carry only
-- the name - CNAF fills the birth details for ARS-origin rows alone.
--
-- No cnaf_allocataire_nom_usage column here: CNAF defaults the usage name to the same RESPDOS
-- value already serialized as the "nom" key of the allocataire JSON - beneficiaires.allocataire_nom
-- once flattened - so it would only duplicate that field under a different casing.

CREATE TABLE IF NOT EXISTS public.beneficiaire_cnaf_extra_field (
	id_psp varchar(255) NOT NULL,
	cnaf_allocataire_nom_naissance varchar(255) NULL,
	cnaf_allocataire_date_naissance date NULL,
	cnaf_allocataire_genre varchar(255) NULL,
	cnaf_allocataire_code_insee_naissance varchar(255) NULL,
	cnaf_allocataire_pays_naissance varchar(255) NULL,
	cnaf_allocataire_code_pays_naissance varchar(255) NULL,
	CONSTRAINT beneficiaire_cnaf_extra_field_pkey PRIMARY KEY (id_psp),
	-- Removing a beneficiary removes what only existed to describe it.
	CONSTRAINT beneficiaire_cnaf_extra_field_id_psp_foreign FOREIGN KEY (id_psp)
		REFERENCES public.beneficiaires(id_psp) ON DELETE CASCADE
);
