"""Unit tests for clean_cnous_lib, the CNOUS-specific logic of clean_cnous.ipynb.

Everything the CNOUS shares with the CNAF and the MSA is tested one folder up, in
../test_partners_lib.py; the code drawing and its bookkeeping in ../test_generate_codes_lib.py
and ../../utils/test_codes_utils.py. What is checked here is what the CNOUS file alone
brings: its 20 delivered fields against 19 header names, its two date formats, its ISO
birth-country code and the leading zeros its export drops.

Names are invented syllable by syllable rather than taken from any plausible French
surname list, so no fixture can collide with a real beneficiary.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnous/test_clean_cnous_lib.py
"""

import json
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

import clean_cnous_lib as lib
import partners_lib as partners


def raw_row(**values) -> pd.DataFrame:
    """A one-row frame carrying all 20 delivered columns, blank but for the ones given.

    map_cnous_columns checks the header it is handed, so the fixtures it takes have to be
    complete even when the assertion only looks at two columns.
    """
    row = {column: [''] for column in lib.CNOUS_RAW_COLUMNS}
    return pd.DataFrame({**row, **{column: [value] for column, value in values.items()}})


def mapped_frame(**columns) -> pd.DataFrame:
    """A frame already renamed to the PSP schema, for the steps running after the mapping."""
    return pd.DataFrame(columns)


# --- Reading the file -------------------------------------------------------------

CNOUS_HEADER_LINE = ';'.join(lib.CNOUS_RAW_COLUMNS[:-1])


def test_read_raw_cnous_csv_does_not_shift_columns_on_the_unnamed_echelon(tmp_path):
    """19 header names for 20 fields must not push the first column into the index."""
    filepath = tmp_path / 'cnous.csv'
    filepath.write_text(
        f"{CNOUS_HEADER_LINE}\n"
        "2003-05-14;VORNIDEL;Kalisse;F;Mme;100164578EH;VORNIDEL;Kalisse;"
        "kalisse.vornidel@example.org;14/05/2003;54395;nancy;FR;44 RUE DES TILLEULS;"
        "54600;Villers-les-Nancy;54578;;;0Bis\n",
        encoding='utf-8')

    df = lib.read_raw_cnous_csv(filepath)

    assert list(df.columns) == lib.CNOUS_RAW_COLUMNS
    assert df.index.tolist() == [0]
    assert df.loc[0, 'date_naissance'] == '2003-05-14'
    assert df.loc[0, 'allocataire-matricule'] == '100164578EH'
    assert df.loc[0, 'adresse-allocataire_code_insee'] == '54578'
    assert df.loc[0, 'echelon'] == '0Bis'


# --- Mapping ----------------------------------------------------------------------

def test_map_cnous_columns_renames_to_psp_schema():
    df = raw_row(**{
        'allocataire-adte_naissance': '14/05/2003',
        'allocataire-code_insee_commune_naissance': '54395',
        'adresse-allocataire_voie': '44 RUE DES TILLEULS',
        'adresse-allocataire_cplt_adresse': ' | BAT C',
    })

    mapped = lib.map_cnous_columns(df)

    assert mapped.loc[0, 'allocataire-date_naissance'] == '14/05/2003'
    assert mapped.loc[0, 'allocataire-code_insee_naissance'] == '54395'
    assert mapped.loc[0, 'adresse_allocataire-voie'] == '44 RUE DES TILLEULS'
    assert mapped.loc[0, 'adresse_allocataire-cplt_adresse'] == ' | BAT C'
    # already carrying their PSP name, left untouched
    assert mapped.loc[0, 'allocataire-matricule'] == ''
    assert 'allocataire-adte_naissance' not in mapped.columns


def test_map_cnous_columns_raises_listing_the_missing_columns():
    df = raw_row().drop(columns=['allocataire-adte_naissance', 'adresse-allocataire_voie'])

    with pytest.raises(ValueError) as error:
        lib.map_cnous_columns(df)

    assert 'allocataire-adte_naissance' in str(error.value)
    assert 'adresse-allocataire_voie' in str(error.value)


def test_set_organisme_and_situation_is_constant_for_every_row():
    df = mapped_frame(nom=['VORNIDEL', 'TRAMBOZI'])

    result = lib.set_organisme_and_situation(df)

    assert result['organisme'].tolist() == ['cnous', 'cnous']
    assert result['situation'].tolist() == ['boursier', 'boursier']


# --- Dates ------------------------------------------------------------------------

def test_normalize_allocataire_birthdate_keeps_the_french_format():
    df = mapped_frame(**{'allocataire-date_naissance': ['14/05/2003', '01/01/1998']})

    result = lib.normalize_allocataire_birthdate(df)

    assert result['allocataire-date_naissance'].tolist() == ['14/05/2003', '01/01/1998']


def test_normalize_allocataire_birthdate_nulls_an_unparsable_value():
    df = mapped_frame(**{'allocataire-date_naissance': ['2003-05-14', '', '31/02/2003']})

    result = lib.normalize_allocataire_birthdate(df)

    assert result['allocataire-date_naissance'].isna().all()


# --- Birth country ----------------------------------------------------------------

@pytest.mark.parametrize('delivered', ['', '100', None])
def test_fill_default_birth_country_iso_defaults_to_france(delivered):
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': [delivered]})

    result = lib.fill_default_birth_country_iso(df)

    assert result.loc[0, 'allocataire-code_iso_pays_naissance'] == 'FR'


def test_fill_default_birth_country_iso_keeps_and_uppercases_a_foreign_code():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['ma', 'PT']})

    result = lib.fill_default_birth_country_iso(df)

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['MA', 'PT']


def test_add_birth_country_label_reads_the_label_off_the_iso_code():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['FR', 'MA']})

    result = lib.add_birth_country_label(df)

    assert result['allocataire-pays_naissance'].tolist() == ['FRANCE', 'MOROCCO']


def test_normalize_birthplace_casing_uppercases_the_delivered_commune():
    df = mapped_frame(**{'allocataire-commune_naissance': ['nancy', 'st etienne', None]})

    result = lib.normalize_birthplace_casing(df)

    assert result['allocataire-commune_naissance'].tolist()[:2] == ['NANCY', 'ST ETIENNE']
    assert pd.isna(result.loc[2, 'allocataire-commune_naissance'])


def test_add_birth_country_label_leaves_an_unknown_code_null_instead_of_raising():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['XZ', 'FR']})

    result = lib.add_birth_country_label(df)

    assert pd.isna(result.loc[0, 'allocataire-pays_naissance'])
    assert result.loc[1, 'allocataire-pays_naissance'] == 'FRANCE'


# --- INSEE codes ------------------------------------------------------------------

def test_pad_insee_codes_restores_the_dropped_leading_zero():
    df = mapped_frame(**{
        'allocataire-code_insee_naissance': ['1289', '54395', '2A004', None],
        'adresse_allocataire-code_postal': ['1960', '54600', '', None],
        'adresse_allocataire-code_insee': ['1021', '2A004', '54578', None],
    })

    result = lib.pad_insee_codes(df)

    assert result['allocataire-code_insee_naissance'].tolist()[:3] == ['01289', '54395', '2A004']
    assert result['adresse_allocataire-code_postal'].tolist()[:3] == ['01960', '54600', '']
    assert result['adresse_allocataire-code_insee'].tolist()[:3] == ['01021', '2A004', '54578']
    assert result[lib.INSEE_CODE_COLUMNS].iloc[3].isna().all()


# --- Address ----------------------------------------------------------------------

def test_normalize_address_casing_unaccents_uppercases_and_blanks_empty_fields():
    df = mapped_frame(**{
        'adresse_allocataire-voie': ['44 rue Sainte-Geneviève', '   ', None],
        'adresse_allocataire-commune': ['Villers-lès-Nancy', 'Péronnas', None],
        'adresse_allocataire-cplt_adresse': [' | 12 rue Jean Mermoz', '', None],
    })

    result = lib.normalize_address_casing(df)

    assert result.loc[0, 'adresse_allocataire-voie'] == '44 RUE SAINTE-GENEVIEVE'
    assert result.loc[0, 'adresse_allocataire-commune'] == 'VILLERS-LES-NANCY'
    assert result.loc[1, 'adresse_allocataire-commune'] == 'PERONNAS'
    assert result.loc[0, 'adresse_allocataire-cplt_adresse'] == '| 12 RUE JEAN MERMOZ'
    assert result.iloc[1][lib.ADDRESS_TEXT_COLUMNS].drop('adresse_allocataire-commune').isna().all()
    assert result.iloc[2][lib.ADDRESS_TEXT_COLUMNS].isna().all()


def test_normalize_address_casing_turns_double_quotes_into_single_ones():
    df = mapped_frame(**{
        'adresse_allocataire-voie': ['residence "les tilleuls"'],
        'adresse_allocataire-commune': ['DIJON'],
        'adresse_allocataire-cplt_adresse': [None],
    })

    result = lib.normalize_address_casing(df)

    assert result.loc[0, 'adresse_allocataire-voie'] == "RESIDENCE 'LES TILLEULS'"


# --- Birthdate window -------------------------------------------------------------

def test_filter_within_birthdate_window_includes_both_bounds():
    df = mapped_frame(date_naissance=pd.to_datetime(
        ['1997-12-31', '1998-01-01', '2010-06-15', '2026-12-31', '2027-01-01']))

    result, removed_count = lib.filter_within_birthdate_window(df)

    assert result['date_naissance'].dt.strftime('%Y-%m-%d').tolist() == [
        '1998-01-01', '2010-06-15', '2026-12-31']
    assert removed_count == 2


def test_describe_rows_outside_window_reports_birthdate_and_age():
    df = mapped_frame(date_naissance=pd.to_datetime(['1996-06-11', '2010-06-15']))

    described = lib.describe_rows_outside_window(df)

    assert described['date_naissance'].tolist() == ['11/06/1996']
    assert described['age_en_2026'].tolist() == [30]


def test_describe_rows_outside_window_is_empty_when_everyone_is_in_range():
    df = mapped_frame(date_naissance=pd.to_datetime(['2010-06-15']))

    described = lib.describe_rows_outside_window(df)

    assert described.empty
    assert list(described.columns) == ['date_naissance', 'age_en_2026']


# --- Deduplication ----------------------------------------------------------------

def test_drop_duplicates_on_key_keeps_the_first_row_of_each_value():
    df = mapped_frame(**{
        'allocataire-matricule': ['100164578EH', '110605797AF', '100164578EH'],
        'nom': ['VORNIDEL', 'PELUCHAIN', 'TRAMBOZI'],
    })

    result, dropped_count = lib.drop_duplicates_on_key(df, 'allocataire-matricule')

    assert result['nom'].tolist() == ['VORNIDEL', 'PELUCHAIN']
    assert dropped_count == 1


def test_drop_duplicates_on_key_never_merges_rows_without_a_key():
    """A missing courriel is not a shared one: those boursiers all stay."""
    df = mapped_frame(**{
        'allocataire-courriel': [np.nan, np.nan, 'kalisse.vornidel@example.org', np.nan],
        'nom': ['BARDOUZE', 'QUENDRIS', 'VORNIDEL', 'CHALVOMER'],
    })

    result, dropped_count = lib.drop_duplicates_on_key(df, 'allocataire-courriel')

    assert result['nom'].tolist() == ['BARDOUZE', 'QUENDRIS', 'VORNIDEL', 'CHALVOMER']
    assert dropped_count == 0


# --- JSON serialization -----------------------------------------------------------

def test_allocataire_json_carries_the_birth_details_and_no_empty_shared_field():
    df = mapped_frame(**{
        'allocataire-qualite': ['Mme'],
        'allocataire-matricule': ['100164578EH'],
        'allocataire-nom': ['VORNIDEL'],
        'allocataire-prenom': ['KALISSE'],
        'allocataire-courriel': ['kalisse.vornidel@example.org'],
        'allocataire-date_naissance': ['14/05/2003'],
        'allocataire-code_insee_naissance': ['54395'],
        'allocataire-commune_naissance': ['nancy'],
        'allocataire-code_iso_pays_naissance': ['FR'],
        'allocataire-pays_naissance': ['FRANCE'],
    })

    df = lib.add_missing_allocataire_columns(df)
    result = partners.add_allocataire_json_column(
        df, extra_fields=lib.ALLOCATAIRE_JSON_EXTRA_FIELDS)

    assert json.loads(result.loc[0, 'allocataire']) == {
        'qualite': 'Mme',
        'matricule': '100164578EH',
        'nom': 'VORNIDEL',
        'prenom': 'KALISSE',
        'courriel': 'kalisse.vornidel@example.org',
        'date_naissance': '14/05/2003',
        'code_insee_commune_naissance': '54395',
        'commune_naissance': 'nancy',
        'code_iso_pays_naissance': 'FR',
        'pays_naissance': 'FRANCE',
    }


def test_add_missing_allocataire_columns_survives_the_all_null_column_drop():
    """The columns are added after filter_rows_missing_required_fields, never before."""
    df = mapped_frame(**{
        'nom': ['VORNIDEL'],
        'prenom': ['KALISSE'],
        'genre': ['F'],
        'date_naissance': pd.to_datetime(['2003-05-14']),
    })
    df = lib.add_missing_allocataire_columns(df)

    filtered = partners.filter_rows_missing_required_fields(df)

    assert not set(lib.MISSING_ALLOCATAIRE_COLUMNS) & set(filtered.columns)


# --- Output -----------------------------------------------------------------------

def test_select_output_columns_matches_the_cnaf_final_columns_then_the_production_ones():
    """The 8 first columns are exactly what clean_cnaf_2 hands over as df_final_jeune."""
    assert lib.CNOUS_OUTPUT_COLUMNS[:8] == [
        'nom', 'prenom', 'date_naissance', 'genre',
        'organisme', 'situation', 'allocataire', 'adresse_allocataire']

    df = mapped_frame(**{column: ['x'] for column in lib.CNOUS_OUTPUT_COLUMNS})
    df['echelon'] = ['0Bis']
    df['allocataire-matricule'] = ['100164578EH']

    result = lib.select_output_columns(df)

    assert list(result.columns) == lib.CNOUS_OUTPUT_COLUMNS


def test_cnous_dob_window_is_the_2026_boursier_one():
    assert lib.CNOUS_DOB_MIN == datetime(1998, 1, 1)
    assert lib.CNOUS_DOB_MAX == datetime(2026, 12, 31)
