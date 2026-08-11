"""Unit tests for clean_cnaf_lib, the CNAF-specific logic of the two clean_cnaf notebooks
(clean_cnaf_1_before_qf_batch.ipynb and clean_cnaf_2_after_qf_batch.ipynb).

Everything the CNAF shares with the other partners is tested one folder up, in
../test_partners_lib.py.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnaf/test_clean_cnaf_lib.py
"""

import pandas as pd

import clean_cnaf_lib as lib


def test_clean_raw_cnaf_drops_last_row_and_strips_every_column():
    df = pd.DataFrame({
        'NOMENF': ['  DUPONT  ', ' MARTIN', 'trailing garbage'],
        'PRENOMENF': ['Jean ', '  Marie ', 'x'],
    })

    result = lib.clean_raw_cnaf(df)

    assert len(result) == 2
    assert result['NOMENF'].tolist() == ['DUPONT', 'MARTIN']
    assert result['PRENOMENF'].tolist() == ['Jean', 'Marie']


def test_clean_raw_cnaf_does_not_mutate_its_input():
    df = pd.DataFrame({'NOMENF': ['  DUPONT  ', 'garbage']})

    lib.clean_raw_cnaf(df)

    assert df['NOMENF'].tolist() == ['  DUPONT  ', 'garbage']


def test_split_postal_code_and_commune():
    df = pd.DataFrame({'ADRLIG5DESTDOS': ['75001 PARIS', '97400 SAINT DENIS']})

    result = lib.split_postal_code_and_commune(df)

    assert result['CODE_POSTAL'].tolist() == ['75001', '97400']
    # a commune made of several words must not be truncated
    assert result['COMMUNE'].tolist() == ['PARIS', 'SAINT DENIS']


def test_split_postal_code_and_commune_strips_extra_spaces():
    df = pd.DataFrame({'ADRLIG5DESTDOS': ['75001  PARIS ']})

    result = lib.split_postal_code_and_commune(df)

    assert result['CODE_POSTAL'].tolist() == ['75001']
    assert result['COMMUNE'].tolist() == ['PARIS']


def test_normalize_full_name_spacing_collapses_repeated_whitespace():
    df = pd.DataFrame({'NOMCOMPLET': ['DUPONT   Jean', 'MARTIN Marie']})

    result = lib.normalize_full_name_spacing(df)

    assert result['NOMCOMPLET'].tolist() == ['DUPONT Jean', 'MARTIN Marie']


def test_map_cnaf_columns_renames_to_psp_schema():
    df = pd.DataFrame({
        'MATRICULE': ['123'],
        'CODORG': ['456'],
        'ORIGINESELECTION': ['ARS'],
        'NOMENF': ['DUPONT'],
        'UNKNOWN_COLUMN': ['kept as is'],
    })

    result = lib.map_cnaf_columns(df)

    assert 'allocataire-matricule' in result.columns
    assert 'allocataire-code_organisme' in result.columns
    assert 'situation_origine' in result.columns
    assert 'nom' in result.columns
    assert 'MATRICULE' not in result.columns
    # a column outside the mapping is left untouched
    assert 'UNKNOWN_COLUMN' in result.columns


def test_build_allocataire_address_fields_concatenates_raw_lines():
    df = pd.DataFrame({
        'ADRLIG1DESTDOS': ['CHEZ MME X', ''],
        'ADRLIG2DESTDOS': ['BAT A', ''],
        'ADRLIG3DESTDOS': ['12 RUE', 'RESIDENCE'],
        'ADRLIG4DESTDOS': ['DES FLEURS', ''],
    })

    result = lib.build_allocataire_address_fields(df)

    assert result['adresse_allocataire-cplt_adresse'].tolist() == ['CHEZ MME X BAT A', '']
    # a trailing empty line must not leave a dangling space
    assert result['adresse_allocataire-voie'].tolist() == ['12 RUE DES FLEURS', 'RESIDENCE']


def test_set_organisme_and_situation_maps_cnaf_origin():
    df = pd.DataFrame({'situation_origine': ['ARS', 'AAH', 'AEEH', 'UNKNOWN']})

    result = lib.set_organisme_and_situation(df)

    assert result['organisme'].tolist() == ['CAF'] * 4
    assert result['situation'].tolist()[:3] == ['jeune', 'AAH', 'AEEH']
    assert pd.isna(result['situation'].iloc[3])


def test_drop_raw_address_columns():
    df = pd.DataFrame({column: ['x'] for column in lib.RAW_ADDRESS_COLUMNS_TO_DROP})
    df['nom'] = ['DUPONT']

    result = lib.drop_raw_address_columns(df)

    assert result.columns.tolist() == ['nom']
