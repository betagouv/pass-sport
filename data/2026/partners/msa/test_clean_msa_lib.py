"""Unit tests for clean_msa_lib, the MSA-specific logic of the two clean_msa notebooks
(clean_msa_1_before_qf_batch.ipynb and clean_msa_2_after_qf_batch.ipynb).

Everything the MSA shares with the CNAF is tested one folder up, in
../test_partners_lib.py.

Every identity here is invented: names, communes and streets are built from made-up
syllables so no fixture can collide with a real person or a real address, emails use
example.org and phone numbers come from the 06 39 98 xx xx range ARCEP reserves for
fiction. What the fixtures do reproduce is the *shape* of the rows the 2026 export
delivers: a married allocataire whose destinataire name differs from her birth name, a
file under legal guardianship (a guardian body as addressee, empty civility), a birth
abroad, and the 4-digit INSEE codes of the départements 01-09 whose leading zero the
export drops. INSEE and postal codes stay realistic - they are what the padding logic is
tested against - so they do not correspond to the invented commune names next to them.

Run from data/: source .venv/bin/activate && pytest 2026/partners/msa/test_clean_msa_lib.py
"""

import json

import numpy as np
import pandas as pd

import clean_msa_lib as lib


def test_map_msa_columns_renames_to_psp_schema():
    df = pd.DataFrame({
        'numero_allocataire': ['2020009900001'],
        'nom_naissance_allocataire': ['QUIRBEL'],
        'prenom_usuel_allocataire': ['BALTHOR'],
        'prestation': ['ARS'],
        'nom_beneficiaire': ['QUIRBEL'],
        'nom_destinataire': ['kept as is'],
    })

    result = lib.map_msa_columns(df)

    assert result['allocataire-matricule'].tolist() == ['2020009900001']
    assert result['allocataire-nom'].tolist() == ['QUIRBEL']
    assert result['allocataire-prenom'].tolist() == ['BALTHOR']
    assert result['situation_origine'].tolist() == ['ARS']
    assert result['nom'].tolist() == ['QUIRBEL']
    # a column outside the mapping is left untouched, the destinataire ones are read later
    assert 'nom_destinataire' in result.columns
    assert 'numero_allocataire' not in result.columns


def test_map_msa_columns_copies_the_birth_name_onto_the_pivot_column():
    # MSA has a single allocataire name column and it is the birth name
    df = pd.DataFrame({'nom_naissance_allocataire': ['VELTRANO']})

    result = lib.map_msa_columns(df)

    assert result['allocataire-nom'].tolist() == ['VELTRANO']
    assert result['allocataire-nom_naissance'].tolist() == ['VELTRANO']


def test_derive_allocataire_genre():
    df = pd.DataFrame({'allocataire-qualite': ['MR', 'MME', '']})

    result = lib.derive_allocataire_genre(df)

    assert result['allocataire-genre'].tolist()[:2] == ['M', 'F']
    # a blank civility (file under guardianship) yields no genre rather than a wrong one
    assert pd.isna(result['allocataire-genre'].iloc[2])


def test_normalize_beneficiary_genre():
    df = pd.DataFrame({'genre': ['1', '2']})

    result = lib.normalize_beneficiary_genre(df)

    assert result['genre'].tolist() == ['M', 'F']


def test_normalize_allocataire_birthdate():
    df = pd.DataFrame({'allocataire-date_naissance': ['19850430', '19951221']})

    result = lib.normalize_allocataire_birthdate(df)

    assert result['allocataire-date_naissance'].tolist() == ['30/04/1985', '21/12/1995']


def test_normalize_allocataire_birthdate_coerces_unparsable_values():
    df = pd.DataFrame({'allocataire-date_naissance': ['0', '', '19700329']})

    result = lib.normalize_allocataire_birthdate(df)

    assert pd.isna(result['allocataire-date_naissance'].iloc[0])
    assert pd.isna(result['allocataire-date_naissance'].iloc[1])
    assert result['allocataire-date_naissance'].iloc[2] == '29/03/1970'


def test_fill_france_birth_country_labels_the_empty_french_rows():
    df = pd.DataFrame({
        'allocataire-code_iso_pays_naissance': ['0', 'FR', 'MA'],
        'allocataire-pays_naissance': ['', '', 'MAROC'],
    })

    result = lib.fill_france_birth_country(df)

    assert result['allocataire-pays_naissance'].tolist() == ['FRANCE', 'FRANCE', 'MAROC']
    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['FR', 'FR', 'MA']


def test_pad_birthplace_insee_restores_the_dropped_leading_zero():
    df = pd.DataFrame({'allocataire-code_insee_naissance': ['9122', '65440', '']})

    result = lib.pad_birthplace_insee(df)

    assert result['allocataire-code_insee_naissance'].tolist() == ['09122', '65440', '']


def test_pad_address_codes_restores_the_dropped_leading_zeros():
    # a commune of the Ariège: postal code 09000 and commune code 09122
    df = pd.DataFrame({
        'adresse_allocataire-code_postal': ['9000', '32260', ''],
        'adresse_allocataire-code_insee': ['9122', '32118', ''],
    })

    result = lib.pad_address_codes(df)

    assert result['adresse_allocataire-code_postal'].tolist() == ['09000', '32260', '']
    assert result['adresse_allocataire-code_insee'].tolist() == ['09122', '32118', '']


def test_pad_address_codes_leaves_a_corsican_code_alone():
    df = pd.DataFrame({
        'adresse_allocataire-code_postal': ['20000'],
        'adresse_allocataire-code_insee': ['2A004'],
    })

    result = lib.pad_address_codes(df)

    assert result['adresse_allocataire-code_insee'].tolist() == ['2A004']


def test_build_allocataire_address_fields_joins_the_four_columns():
    df = pd.DataFrame({
        'numero_voie_dest': ['2'],
        'complement_numero_voie_dest': ['B'],
        'type_voie_dest': ['RUE'],
        'voie_dest': ['DES THALVES'],
    })

    result = lib.build_allocataire_address_fields(df)

    assert result['adresse_allocataire-voie'].tolist() == ['2 B RUE DES THALVES']


def test_build_allocataire_address_fields_skips_the_empty_parts():
    df = pd.DataFrame({
        # no numero, no complement: "890 CHE DE VORNAC" must not gain a double space
        'numero_voie_dest': ['890', '', ''],
        'complement_numero_voie_dest': ['', '', ''],
        'type_voie_dest': ['CHE', 'LD', ''],
        'voie_dest': ['DE VORNAC', 'LES THALVES', ''],
    })

    result = lib.build_allocataire_address_fields(df)

    assert result['adresse_allocataire-voie'].tolist() == [
        '890 CHE DE VORNAC', 'LD LES THALVES', '']


def test_build_nom_adresse_postale():
    df = pd.DataFrame({
        'qualite_destinataire': ['MR', 'MME'],
        'nom_destinataire': ['QUIRBEL', 'ZANDRIC'],
        'prenom_destinataire': ['BALTHOR', 'ASTRANE'],
    })

    result = lib.build_nom_adresse_postale(df)

    assert result['adresse_allocataire-nom_adresse_postale'].tolist() == [
        'MR QUIRBEL BALTHOR', 'MME ZANDRIC ASTRANE']


def test_build_nom_adresse_postale_collapses_a_blank_civility():
    df = pd.DataFrame({
        'qualite_destinataire': [''],
        'nom_destinataire': ['TUTELLE ORBISK'],
        'prenom_destinataire': ['SERVICE MJPM'],
    })

    result = lib.build_nom_adresse_postale(df)

    assert result['adresse_allocataire-nom_adresse_postale'].tolist() == [
        'TUTELLE ORBISK SERVICE MJPM']


def test_build_allocataire_nom_usage_takes_the_married_name():
    df = pd.DataFrame({
        'qualite_destinataire': ['MME', 'MR'],
        'nom_destinataire': ['ZANDRIC', 'QUIRBEL'],
        'allocataire-nom_naissance': ['VELTRANO', 'QUIRBEL'],
    })

    result = lib.build_allocataire_nom_usage(df)

    assert result['allocataire-nom_usage'].tolist() == ['ZANDRIC', 'QUIRBEL']


def test_build_allocataire_nom_usage_falls_back_when_the_destinataire_is_a_guardian():
    # a file under legal guardianship: the destinataire is the guardian body, not the
    # allocataire - sending it as a usage name would be a false identity
    df = pd.DataFrame({
        'qualite_destinataire': [''],
        'nom_destinataire': ['TUTELLE ORBISK'],
        'allocataire-nom_naissance': ['MORVAX'],
    })

    result = lib.build_allocataire_nom_usage(df)

    assert result['allocataire-nom_usage'].tolist() == ['MORVAX']


def test_set_organisme_and_situation_maps_the_msa_prestations():
    df = pd.DataFrame({'situation_origine': ['ARS', 'AAH', 'AEH', 'UNKNOWN']})

    result = lib.set_organisme_and_situation(df)

    assert result['organisme'].tolist() == ['MSA'] * 4
    # MSA spells the AEEH route "AEH"
    assert result['situation'].tolist()[:3] == ['jeune', 'AAH', 'AEEH']
    assert pd.isna(result['situation'].iloc[3])


def test_drop_raw_msa_columns():
    df = pd.DataFrame({column: ['x'] for column in lib.MSA_RAW_COLUMNS_TO_DROP})
    df['nom'] = ['QUIRBEL']

    result = lib.drop_raw_msa_columns(df)

    assert result.columns.tolist() == ['nom']


# The 2026 header MSA delivers, in order - see en_tête_colonne_PassSport.csv.
MSA_2026_HEADER = [
    'caisse', 'numero_allocataire', 'organisme', 'qualite_allocataire',
    'nom_naissance_allocataire', 'prenom_usuel_allocataire', 'commune_naissance_alloc',
    'code_insee_commune_naiss_alloc', 'pays_naissance_alloc', 'code_iso_pays_naiss_alloc',
    'date_naissance_alloc', 'adresse_de_messagerie', 'numero_tel_portable',
    'qualite_destinataire', 'nom_destinataire', 'prenom_destinataire',
    'complement_adresse_dest', 'numero_voie_dest', 'complement_numero_voie_dest',
    'type_voie_dest', 'voie_dest', 'code_postal_dest', 'nom_commune_dest',
    'code_insee_commune_dest', 'nom_beneficiaire', 'prenom_beneficiaire',
    'genre_beneficiaire', 'date_naissance_beneficiaire', 'prestation',
]


def test_the_column_mapping_covers_the_delivered_header():
    """Every 2026 MSA column is either mapped to the PSP schema or explicitly dropped."""
    unaccounted = set(MSA_2026_HEADER) - set(lib.MSA_COLUMN_MAPPING) - set(lib.MSA_RAW_COLUMNS_TO_DROP)

    assert unaccounted == set()


def test_the_json_extra_fields_point_at_existing_pipeline_columns():
    mapped_columns = set(lib.MSA_COLUMN_MAPPING.values()) | {
        'allocataire-nom_naissance', 'adresse_allocataire-nom_adresse_postale'}
    referenced = set(lib.ALLOCATAIRE_JSON_EXTRA_FIELDS.values()) \
        | set(lib.ADRESSE_JSON_EXTRA_FIELDS.values())

    assert referenced <= mapped_columns


def test_pad_birthplace_insee_leaves_a_missing_value_alone():
    df = pd.DataFrame({'allocataire-code_insee_naissance': [np.NaN]})

    result = lib.pad_birthplace_insee(df)

    assert pd.isna(result['allocataire-code_insee_naissance'].iloc[0])


# --- column-shape guard over the whole notebook sequence --------------------------

# An invented row, padded to the fixed widths of the MSA export: a married allocataire
# born in France, whose destinataire name differs from her birth name.
MSA_2026_ROW = [
    '32', '2020009900001', '320', 'MME ', 'VELTRANO', 'ASTRANE             ',
    'VARNEUIL                 ', '32252', '                         ', '0', '19800312',
    'a.zandric@example.org   ', '639980142', 'MME        ', 'ZANDRIC                  ',
    'ASTRANE             ', '                         ', '    ', ' ', 'LD  ',
    'LES THALVES              ', '32260', 'CLARENOIS                ', '32118',
    'ZANDRIC                  ', 'LUVIAN              ', '1', '20100407', 'ARS',
]


def _run_notebook_column_sequence():
    """Replay the column-shaping steps of both MSA notebooks, in notebook order."""
    import partners_lib as partners

    df = pd.DataFrame([MSA_2026_ROW], columns=MSA_2026_HEADER)

    df = partners.strip_all_string_columns(df)
    df = lib.map_msa_columns(df)
    df = lib.derive_allocataire_genre(df)
    df = lib.normalize_beneficiary_genre(df)
    df = lib.normalize_allocataire_birthdate(df)
    df = lib.fill_france_birth_country(df)
    df = lib.pad_birthplace_insee(df)
    df = partners.clear_placeholder_phone_numbers(df)
    df = partners.normalize_allocataire_qualite(df)
    df = lib.build_allocataire_address_fields(df)
    df = lib.build_nom_adresse_postale(df)
    df = lib.set_organisme_and_situation(df)
    df = partners.parse_beneficiary_birthdate(df, '%Y%m%d')
    df = lib.pad_address_codes(df)
    df = lib.drop_raw_msa_columns(df)
    df = partners.add_allocataire_json_column(df, lib.ALLOCATAIRE_JSON_EXTRA_FIELDS)
    df = partners.add_adresse_allocataire_json_column(df, lib.ADRESSE_JSON_EXTRA_FIELDS)
    return partners.drop_intermediate_columns(
        df, partners.FINAL_COLUMNS_TO_DROP + lib.MSA_EXTRA_COLUMNS_TO_DROP)


def test_the_export_lands_on_the_same_columns_as_the_cnaf_one():
    """Guards the drop lists against a column added to the mapping and never disposed of."""
    result = _run_notebook_column_sequence()

    assert sorted(result.columns) == [
        'adresse_allocataire', 'allocataire', 'date_naissance', 'genre', 'nom', 'organisme',
        'prenom', 'situation']


def test_the_exported_row_carries_the_msa_json_fields():
    result = _run_notebook_column_sequence()

    allocataire = json.loads(result['allocataire'].iloc[0])
    adresse = json.loads(result['adresse_allocataire'].iloc[0])

    assert allocataire == {
        'qualite': 'Mme', 'matricule': '2020009900001', 'code_organisme': '320',
        'telephone': '639980142', 'nom': 'VELTRANO', 'prenom': 'ASTRANE',
        'courriel': 'a.zandric@example.org', 'date_naissance': '12/03/1980',
        'commune_naissance': 'VARNEUIL', 'code_insee_commune_naissance': '32252',
        'pays_naissance': 'FRANCE', 'code_iso_pays_naissance': 'FR',
    }
    assert adresse == {
        'voie': 'LD LES THALVES', 'code_postal': '32260', 'commune': 'CLARENOIS',
        'code_insee': '32118', 'cplt_adresse': '',
        'nom_adresse_postale': 'MME ZANDRIC ASTRANE',
    }


def test_the_exported_row_keeps_the_beneficiary_identity():
    result = _run_notebook_column_sequence()

    assert result['nom'].iloc[0] == 'ZANDRIC'
    assert result['prenom'].iloc[0] == 'LUVIAN'
    assert result['genre'].iloc[0] == 'M'
    assert result['date_naissance'].iloc[0] == pd.Timestamp('2010-04-07')
    assert result['organisme'].iloc[0] == 'MSA'
    assert result['situation'].iloc[0] == 'jeune'
