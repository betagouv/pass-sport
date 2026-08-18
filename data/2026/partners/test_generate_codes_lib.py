"""Unit tests for generate_codes_lib, the code generation step of the 2026 campaign.

Run from data/: source .venv/bin/activate && pytest 2026/partners/test_generate_codes_lib.py
"""

import csv
from datetime import date

import pandas as pd
import pytest

import generate_codes_lib as lib


def a_cleaned_df(rows: int = 3) -> pd.DataFrame:
    """A cleaned file as any of the 4 sources leaves it, reduced to what this step reads."""
    return pd.DataFrame({
        'nom': [f"DUPONT{i}" for i in range(rows)],
        'prenom': [f"Jean{i}" for i in range(rows)],
        'date_naissance': ['2012-05-04'] * rows,
        'genre': ['M' if i % 2 == 0 else 'F' for i in range(rows)],
        'organisme': ['CAF'] * rows,
        'situation': ['quotient_familial'] * rows,
    })


def write_cleaned_file(filepath, df: pd.DataFrame) -> str:
    df.to_csv(filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    return str(filepath)


def read_output(filepath) -> pd.DataFrame:
    return pd.read_csv(filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False)


# --- Default production columns ---------------------------------------------------

def test_add_production_default_columns():
    df = a_cleaned_df(2)

    result = lib.add_production_default_columns(df)

    assert result['exercice_id'].tolist() == [lib.EXERCICE_ID, lib.EXERCICE_ID]
    assert result['uuid_doc'].isna().all()
    # nothing is validated, refused, zrr or qpv at generation time
    assert not result[['zrr', 'qpv', 'a_valider', 'refuser']].any().any()
    assert result['created_at'].dt.tz is not None
    assert (result['created_at'] == result['updated_at']).all()


def test_add_production_default_columns_does_not_mutate_its_input():
    df = a_cleaned_df(1)

    lib.add_production_default_columns(df)

    assert 'exercice_id' not in df.columns


# --- Output path ------------------------------------------------------------------

def test_dated_output_path_sits_next_to_its_input():
    result = lib.dated_output_path('/data/2026/partners/franceconnect/FC_2026.csv', 'FC')

    today = date.today().strftime('%Y-%m-%d')
    assert result == f"/data/2026/partners/franceconnect/{today}-fc-with-codes.csv"


# --- The whole step ---------------------------------------------------------------

def test_generate_codes_for_file(tmp_path):
    input_filepath = write_cleaned_file(tmp_path / 'FC_2026.csv', a_cleaned_df(5))
    output_filepath = tmp_path / 'out.csv'
    codes_filepath = tmp_path / 'codes.csv'

    stats = lib.generate_codes_for_file(input_filepath, output_filepath, codes_filepath)

    df_out = read_output(output_filepath)
    assert len(df_out) == 5
    assert df_out['id_psp'].is_unique
    assert df_out['id_psp'].ne('').all()
    assert stats['beneficiaires'] == 5
    assert stats['genre_M'] == 3 and stats['genre_F'] == 2
    # the codes just handed out are now tracked for the next run
    assert stats['codes_suivis'] == 5
    assert set(pd.read_csv(codes_filepath)['code']) == set(df_out['id_psp'])


def test_generate_codes_for_file_leaves_its_input_untouched(tmp_path):
    input_filepath = write_cleaned_file(tmp_path / 'FC_2026.csv', a_cleaned_df(3))

    lib.generate_codes_for_file(input_filepath, tmp_path / 'out.csv', tmp_path / 'codes.csv')

    assert 'id_psp' not in read_output(input_filepath).columns


def test_generate_codes_for_file_never_reuses_a_code(tmp_path):
    """The point of the code list: two runs of the campaign cannot collide."""
    codes_filepath = tmp_path / 'codes.csv'
    first_input = write_cleaned_file(tmp_path / 'CNAF_2026.csv', a_cleaned_df(20))
    second_input = write_cleaned_file(tmp_path / 'FC_2026.csv', a_cleaned_df(20))

    lib.generate_codes_for_file(first_input, tmp_path / 'out1.csv', codes_filepath)
    stats = lib.generate_codes_for_file(second_input, tmp_path / 'out2.csv', codes_filepath)

    first_codes = set(read_output(tmp_path / 'out1.csv')['id_psp'])
    second_codes = set(read_output(tmp_path / 'out2.csv')['id_psp'])
    assert not first_codes.intersection(second_codes)
    assert stats['codes_suivis'] == 40


def test_generate_codes_for_file_starts_from_an_empty_code_list(tmp_path):
    # very first run of a campaign: the code list does not exist yet
    input_filepath = write_cleaned_file(tmp_path / 'FC_2026.csv', a_cleaned_df(2))

    stats = lib.generate_codes_for_file(
        input_filepath, tmp_path / 'out.csv', tmp_path / 'does-not-exist-yet.csv')

    assert stats['codes_suivis'] == 2


def test_generate_codes_for_file_refuses_a_file_that_already_holds_codes(tmp_path):
    """Guard against a second pass over the same people, which would burn a second code."""
    df = a_cleaned_df(2)
    df['id_psp'] = ['26-AAAA-AAAA', '26-BBBB-BBBB']
    input_filepath = write_cleaned_file(tmp_path / 'FC_2026.csv', df)

    with pytest.raises(AssertionError):
        lib.generate_codes_for_file(input_filepath, tmp_path / 'out.csv', tmp_path / 'c.csv')
