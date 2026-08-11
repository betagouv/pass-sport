"""Unit tests for clean_cnaf_lib, the logic extracted from the two clean_cnaf notebooks
(clean_cnaf_1_before_qf_batch.ipynb and clean_cnaf_2_after_qf_batch.ipynb).

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnaf/test_clean_cnaf_lib.py
"""

import json

import numpy as np
import pandas as pd
import pytest

import clean_cnaf_lib as lib


# --- Phase 1: pre-checkpoint ------------------------------------------------------

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


def test_clear_placeholder_phone_numbers():
    df = pd.DataFrame({'allocataire-telephone': ['0600000000', '0612345678', '0000000000']})

    result = lib.clear_placeholder_phone_numbers(df)

    assert pd.isna(result['allocataire-telephone'].iloc[0])
    assert result['allocataire-telephone'].iloc[1] == '0612345678'
    assert pd.isna(result['allocataire-telephone'].iloc[2])


def test_normalize_allocataire_qualite():
    df = pd.DataFrame({'allocataire-qualite': ['MME ', ' MR', 'Mme']})

    result = lib.normalize_allocataire_qualite(df)

    assert result['allocataire-qualite'].tolist() == ['Mme', 'M', 'Mme']


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


def test_parse_beneficiary_birthdate():
    df = pd.DataFrame({'date_naissance': ['15/03/2010', '01/12/2009']})

    result = lib.parse_beneficiary_birthdate(df)

    assert result['date_naissance'].tolist() == [pd.Timestamp('2010-03-15'), pd.Timestamp('2009-12-01')]


# --- qf-batch input ---------------------------------------------------------------

def _qf_route_frame(rows):
    """Frame shaped like the mapped CNAF data, for the qf-batch input steps."""
    df = pd.DataFrame(rows)
    df['date_naissance'] = pd.to_datetime(df['date_naissance'])
    return df


def test_select_qf_route_allocataires_keeps_window_boundaries():
    df = _qf_route_frame([
        {'situation_origine': 'ARS', 'date_naissance': '2009-01-01',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'A'},
        {'situation_origine': 'ARS', 'date_naissance': '2020-12-31',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'B'},
        {'situation_origine': 'ARS', 'date_naissance': '2008-12-31',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'C'},
        {'situation_origine': 'ARS', 'date_naissance': '2021-01-01',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'D'},
    ])

    df_allocataires, df_route = lib.select_qf_route_allocataires(df)

    assert df_allocataires['allocataire-matricule'].tolist() == ['A', 'B']
    assert len(df_route) == 2


def test_select_qf_route_allocataires_excludes_non_ars_rows():
    df = _qf_route_frame([
        {'situation_origine': 'AAH', 'date_naissance': '2010-06-01',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'A'},
        {'situation_origine': 'AEEH', 'date_naissance': '2010-06-01',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'B'},
        {'situation_origine': 'ARS', 'date_naissance': '2010-06-01',
         'allocataire-code_organisme': '1', 'allocataire-matricule': 'C'},
    ])

    df_allocataires, _ = lib.select_qf_route_allocataires(df)

    assert df_allocataires['allocataire-matricule'].tolist() == ['C']


def test_select_qf_route_allocataires_dedupes_one_call_per_household():
    # two children of the same allocataire -> a single quotient_familial call
    df = _qf_route_frame([
        {'situation_origine': 'ARS', 'date_naissance': '2010-06-01',
         'allocataire-code_organisme': '75', 'allocataire-matricule': 'A'},
        {'situation_origine': 'ARS', 'date_naissance': '2012-06-01',
         'allocataire-code_organisme': '75', 'allocataire-matricule': 'A'},
        {'situation_origine': 'ARS', 'date_naissance': '2012-06-01',
         'allocataire-code_organisme': '92', 'allocataire-matricule': 'A'},
    ])

    df_allocataires, df_route = lib.select_qf_route_allocataires(df)

    assert len(df_route) == 3
    # same matricule but a different code_organisme is a different household
    assert len(df_allocataires) == 2
    assert df_allocataires['allocataire-code_organisme'].tolist() == ['75', '92']


def test_format_qf_identity_fields():
    df = pd.DataFrame({
        'allocataire-nom': ['DUPONT'],
        'allocataire-genre': ['F'],
        'allocataire-date_naissance': ['09/02/1980'],
    })

    result = lib.format_qf_identity_fields(df)

    assert result['allocataire-nom_usage'].tolist() == ['DUPONT']
    assert result['allocataire-genre'].tolist() == ['female']
    assert result['allocataire-date_naissance'].tolist() == ['1980-02-09']


def test_format_qf_identity_fields_coerces_unparsable_birthdate():
    df = pd.DataFrame({
        'allocataire-nom': ['DUPONT', 'MARTIN'],
        'allocataire-genre': ['M', 'X'],
        'allocataire-date_naissance': ['not a date', '15/03/1975'],
    })

    result = lib.format_qf_identity_fields(df)

    assert pd.isna(result['allocataire-date_naissance'].iloc[0])
    assert result['allocataire-date_naissance'].iloc[1] == '1975-03-15'
    assert result['allocataire-genre'].tolist()[0] == 'male'
    # an unexpected genre value is dropped rather than passed through
    assert pd.isna(result['allocataire-genre'].iloc[1])


# normalize_country_label and build_country_cog_lookup are national mechanics living in
# utils/data_utils.py - covered by utils/test_data_utils.py. Only their CNAF use
# (PAYSNAIDOS -> allocataire-code_pays_naissance) is tested here.

def _cog_reference_frame():
    return pd.DataFrame({
        'COG': ['99100', '99350', '99326', '99999'],
        'LIBCOG': ['France', 'Maroc', "Côte d'Ivoire", ''],
        'LIBENR': ['République française', 'Royaume du Maroc', "République de Côte d'Ivoire", ''],
    })


def test_map_birth_country_to_cog():
    lookup = lib.build_country_cog_lookup(_cog_reference_frame())
    df = pd.DataFrame({'allocataire-pays_naissance': ['FRANCE', 'MAROC', 'COTE D IVOIRE']})

    result, unmapped_labels = lib.map_birth_country_to_cog(df, lookup)

    assert result['allocataire-code_pays_naissance'].tolist() == ['99100', '99350', '99326']
    assert unmapped_labels == []


def test_map_birth_country_to_cog_reports_unmapped_labels():
    lookup = lib.build_country_cog_lookup(_cog_reference_frame())
    df = pd.DataFrame({'allocataire-pays_naissance': ['FRANCE', 'ATLANTIDE', '']})

    result, unmapped_labels = lib.map_birth_country_to_cog(df, lookup)

    assert unmapped_labels == ['ATLANTIDE']
    assert pd.isna(result['allocataire-code_pays_naissance'].iloc[1])
    # an empty label is a missing value, not an unmapped country
    assert pd.isna(result['allocataire-code_pays_naissance'].iloc[2])


def test_clear_foreign_birthplace_insee():
    df = pd.DataFrame({
        'allocataire-code_pays_naissance': ['99100', '99350', np.NaN],
        'allocataire-code_insee_naissance': ['75056', 'CASABLANCA', 'SOMEWHERE'],
    })

    result, cleared_count = lib.clear_foreign_birthplace_insee(df)

    assert result['allocataire-code_insee_naissance'].iloc[0] == '75056'
    assert pd.isna(result['allocataire-code_insee_naissance'].iloc[1])
    # an unmapped country is cleared too - we can't assert France
    assert pd.isna(result['allocataire-code_insee_naissance'].iloc[2])
    assert cleared_count == 2


def test_select_qf_batch_columns_returns_the_qf_batch_contract():
    df = pd.DataFrame({column: ['value'] for column in lib.QF_BATCH_COLUMNS})
    df['extra_column'] = ['dropped']

    result = lib.select_qf_batch_columns(df)

    assert result.columns.tolist() == lib.QF_BATCH_COLUMNS


# --- beneficiary cleaning ---------------------------------------------------------

def test_drop_raw_address_columns():
    df = pd.DataFrame({column: ['x'] for column in lib.RAW_ADDRESS_COLUMNS_TO_DROP})
    df['nom'] = ['DUPONT']

    result = lib.drop_raw_address_columns(df)

    assert result.columns.tolist() == ['nom']


def test_filter_rows_missing_required_fields_drops_incomplete_rows():
    df = pd.DataFrame({
        'nom': ['DUPONT', 'MARTIN', 'DURAND'],
        'prenom': ['Jean', 'Marie', 'Paul'],
        'date_naissance': [pd.Timestamp('2010-01-01'), pd.Timestamp('2011-01-01'), pd.NaT],
        'genre': ['M', np.NaN, 'M'],
    })

    result = lib.filter_rows_missing_required_fields(df)

    assert result['nom'].tolist() == ['DUPONT']


def test_filter_rows_missing_required_fields_handles_an_empty_result():
    df = pd.DataFrame({
        'nom': ['DUPONT'],
        'prenom': ['Jean'],
        'date_naissance': [pd.Timestamp('2010-01-01')],
        'genre': [np.NaN],
    })

    result = lib.filter_rows_missing_required_fields(df)

    assert len(result) == 0


def test_normalize_identity_casing():
    df = pd.DataFrame({
        'prenom': ['Éloïse'],
        'nom': ['Lefèvre'],
        'genre': ['m'],
    })

    result = lib.normalize_identity_casing(df)

    assert result['prenom'].tolist() == ['ELOISE']
    assert result['nom'].tolist() == ['LEFEVRE']
    assert result['genre'].tolist() == ['M']


def test_normalize_email_casing():
    df = pd.DataFrame({'allocataire-courriel': ['Jean.DUPONT@Example.COM', '']})

    result = lib.normalize_email_casing(df)

    assert result['allocataire-courriel'].tolist() == ['jean.dupont@example.com', '']


def test_filter_within_eligibility_floor_includes_the_boundary():
    df = pd.DataFrame({'date_naissance': pd.to_datetime(['1995-12-31', '1996-01-01', '2010-01-01'])})

    result = lib.filter_within_eligibility_floor(df)

    assert result['date_naissance'].tolist() == [pd.Timestamp('1996-01-01'), pd.Timestamp('2010-01-01')]


def test_fix_phone_number_formatting_adds_the_missing_leading_zero():
    df = pd.DataFrame({'allocataire-telephone': ['612345678', '0612345678', '61234567', np.NaN]})

    result = lib.fix_phone_number_formatting(df)

    assert result['allocataire-telephone'].iloc[0] == '0612345678'
    # already well formed, and too short to be a 9-digit number missing its zero
    assert result['allocataire-telephone'].iloc[1] == '0612345678'
    assert result['allocataire-telephone'].iloc[2] == '61234567'
    assert pd.isna(result['allocataire-telephone'].iloc[3])


def test_fix_phone_number_formatting_clears_lone_zero():
    df = pd.DataFrame({'allocataire-telephone': ['0', '0612345678']})

    result = lib.fix_phone_number_formatting(df)

    assert pd.isna(result['allocataire-telephone'].iloc[0])
    assert result['allocataire-telephone'].iloc[1] == '0612345678'


def test_clear_blank_email():
    df = pd.DataFrame({'allocataire-courriel': ['', 'jean@example.com']})

    result = lib.clear_blank_email(df)

    assert pd.isna(result['allocataire-courriel'].iloc[0])
    assert result['allocataire-courriel'].iloc[1] == 'jean@example.com'


def test_shift_birthdate_by_hours():
    df = pd.DataFrame({'date_naissance': pd.to_datetime(['2010-03-15'])})

    result = lib.shift_birthdate_by_hours(df)

    assert result['date_naissance'].tolist() == [pd.Timestamp('2010-03-15 04:00:00')]


def _beneficiary_row(**overrides):
    row = {
        'date_naissance': pd.Timestamp('2010-03-15'),
        'nom': 'DUPONT',
        'prenom': 'JEAN',
        'genre': 'M',
        'organisme': 'CAF',
        'situation': 'jeune',
        'allocataire-qualite': 'Mme',
        'allocataire-matricule': '123',
        'allocataire-code_organisme': '75',
        'allocataire-telephone': '0612345678',
        'allocataire-nom': 'DUPONT',
        'allocataire-prenom': 'MARIE',
        'allocataire-courriel': 'marie@example.com',
    }
    row.update(overrides)
    return row


def test_drop_duplicate_beneficiaries():
    df = pd.DataFrame([_beneficiary_row(), _beneficiary_row(), _beneficiary_row(prenom='PAUL')])

    result, dropped_count = lib.drop_duplicate_beneficiaries(df)

    assert len(result) == 2
    assert dropped_count == 1


def test_drop_duplicate_beneficiaries_keeps_rows_differing_on_any_key_column():
    df = pd.DataFrame([_beneficiary_row(), _beneficiary_row(**{'allocataire-telephone': '0700000009'})])

    result, dropped_count = lib.drop_duplicate_beneficiaries(df)

    assert len(result) == 2
    assert dropped_count == 0


def test_add_allocataire_json_column_omits_null_fields():
    df = pd.DataFrame([_beneficiary_row(**{'allocataire-telephone': np.NaN, 'allocataire-courriel': np.NaN})])

    result = lib.add_allocataire_json_column(df)

    allocataire = json.loads(result['allocataire'].iloc[0])
    assert 'telephone' not in allocataire
    assert 'courriel' not in allocataire
    assert allocataire['matricule'] == '123'
    assert allocataire['qualite'] == 'Mme'


def test_add_allocataire_json_column_unaccents_names():
    df = pd.DataFrame([_beneficiary_row(**{'allocataire-nom': 'Lefèvre', 'allocataire-prenom': 'Éloïse'})])

    result = lib.add_allocataire_json_column(df)

    allocataire = json.loads(result['allocataire'].iloc[0])
    assert allocataire['nom'] == 'LEFEVRE'
    assert allocataire['prenom'] == 'ELOISE'


def _address_row(**overrides):
    row = {
        'adresse_allocataire-voie': '12 RUE DES FLEURS',
        'adresse_allocataire-code_postal': '7501',
        'adresse_allocataire-commune': 'PARIS',
        'adresse_allocataire-code_insee': '75056',
        'adresse_allocataire-cplt_adresse': 'BAT A',
    }
    row.update(overrides)
    return row


def test_add_adresse_allocataire_json_column_pads_codes_to_five_digits():
    df = pd.DataFrame([_address_row()])

    result = lib.add_adresse_allocataire_json_column(df)

    adresse = json.loads(result['adresse_allocataire'].iloc[0])
    assert adresse['code_postal'] == '07501'
    assert adresse['code_insee'] == '75056'
    assert adresse['commune'] == 'PARIS'


def test_add_adresse_allocataire_json_column_omits_null_fields():
    df = pd.DataFrame([_address_row(**{'adresse_allocataire-cplt_adresse': np.NaN,
                                       'adresse_allocataire-code_insee': np.NaN})])

    result = lib.add_adresse_allocataire_json_column(df)

    adresse = json.loads(result['adresse_allocataire'].iloc[0])
    assert 'cplt_adresse' not in adresse
    assert 'code_insee' not in adresse
    assert adresse['voie'] == '12 RUE DES FLEURS'


def test_drop_intermediate_columns():
    df = pd.DataFrame([{column: 'x' for column in lib.FINAL_COLUMNS_TO_DROP} | {'nom': 'DUPONT'}])

    result = lib.drop_intermediate_columns(df)

    assert result.columns.tolist() == ['nom']


# --- Phase 2: post-checkpoint -----------------------------------------------------

def test_build_allocataire_key():
    df = pd.DataFrame({
        'allocataire-code_organisme': ['75', '92'],
        'allocataire-matricule': ['123', '456'],
    })

    assert lib.build_allocataire_key(df).tolist() == ['75|123', '92|456']


def test_build_qf_value_lookup():
    df_qf_batch_output = pd.DataFrame({
        'allocataire-code_organisme': ['75', '92', '93'],
        'allocataire-matricule': ['123', '456', '789'],
        'qf_value': ['650', '1200', ''],
    })

    lookup = lib.build_qf_value_lookup(df_qf_batch_output)

    assert lookup['75|123'] == 650
    assert lookup['92|456'] == 1200
    # a household qf-batch could not settle (404, error) has no value
    assert pd.isna(lookup['93|789'])


def test_attach_qf_value_fans_out_to_every_child_of_a_household():
    df = pd.DataFrame({
        'allocataire-code_organisme': ['75', '75', '92'],
        'allocataire-matricule': ['123', '123', '456'],
        'nom': ['DUPONT', 'DUPONT', 'MARTIN'],
    })
    lookup = pd.Series({'75|123': 650.0})

    result = lib.attach_qf_value(df, lookup)

    assert result['qf_value'].iloc[0] == 650
    assert result['qf_value'].iloc[1] == 650
    # no verdict for this household
    assert pd.isna(result['qf_value'].iloc[2])


def test_attach_qf_value_preserves_the_index():
    df = pd.DataFrame({
        'allocataire-code_organisme': ['75', '92'],
        'allocataire-matricule': ['123', '456'],
    }, index=[7, 11])
    lookup = pd.Series({'75|123': 650.0, '92|456': 800.0})

    result = lib.attach_qf_value(df, lookup)

    assert result.index.tolist() == [7, 11]


def _route_frame(rows):
    df = pd.DataFrame(rows)
    df['date_naissance'] = pd.to_datetime(df['date_naissance'])
    return df


def test_qf_eligible_index_applies_the_threshold_strictly():
    df = _route_frame([
        {'date_naissance': '2010-06-01', 'qf_value': 699.0},
        {'date_naissance': '2010-06-01', 'qf_value': 700.0},
        {'date_naissance': '2010-06-01', 'qf_value': 701.0},
    ])

    assert lib.qf_eligible_index(df).tolist() == [0]


def test_qf_eligible_index_excludes_rows_without_a_verdict():
    df = _route_frame([
        {'date_naissance': '2010-06-01', 'qf_value': np.NaN},
        {'date_naissance': '2010-06-01', 'qf_value': 650.0},
    ])

    assert lib.qf_eligible_index(df).tolist() == [1]


def test_qf_eligible_index_includes_the_window_boundaries():
    df = _route_frame([
        {'date_naissance': '2008-12-31', 'qf_value': 650.0},
        {'date_naissance': '2009-01-01', 'qf_value': 650.0},
        {'date_naissance': '2020-12-31', 'qf_value': 650.0},
        {'date_naissance': '2021-01-01', 'qf_value': 650.0},
    ])

    assert lib.qf_eligible_index(df).tolist() == [1, 2]


def test_aah_eligible_index():
    df = _route_frame([
        {'date_naissance': '1995-12-31', 'situation': 'AAH'},
        {'date_naissance': '1996-01-01', 'situation': 'AAH'},
        {'date_naissance': '2010-12-31', 'situation': 'AAH'},
        {'date_naissance': '2011-01-01', 'situation': 'AAH'},
        {'date_naissance': '2000-01-01', 'situation': 'jeune'},
    ])

    assert lib.aah_eligible_index(df).tolist() == [1, 2]


def test_aeeh_eligible_index():
    df = _route_frame([
        {'date_naissance': '2006-12-31', 'situation': 'AEEH'},
        {'date_naissance': '2007-01-01', 'situation': 'AEEH'},
        {'date_naissance': '2020-12-31', 'situation': 'AEEH'},
        {'date_naissance': '2021-01-01', 'situation': 'AEEH'},
        {'date_naissance': '2010-01-01', 'situation': 'AAH'},
    ])

    assert lib.aeeh_eligible_index(df).tolist() == [1, 2]


def test_select_eligible_by_index_keeps_only_the_selected_rows():
    df_final = pd.DataFrame({'nom': ['A', 'B', 'C']}, index=[0, 2, 4])

    result = lib.select_eligible_by_index(df_final, pd.Index([0, 4]))

    assert result['nom'].tolist() == ['A', 'C']
    assert result.index.tolist() == [0, 4]


def test_select_eligible_by_index_ignores_labels_absent_from_the_final_frame():
    # the route index is built on the wider mapped frame, which holds rows that
    # were dropped from df_final (missing fields, duplicates)
    df_final = pd.DataFrame({'nom': ['A', 'C']}, index=[0, 4])

    result = lib.select_eligible_by_index(df_final, pd.Index([0, 1, 2, 3, 4]))

    assert result['nom'].tolist() == ['A', 'C']


def test_route_selection_matches_the_boolean_mask_it_replaces():
    """The routes are computed on the mapped frame and applied to the narrower df_final.

    Guards the equivalence with the `df_final[mask_built_on_df_source]` form this replaced,
    which relied on pandas silently reindexing an oversized boolean mask.
    """
    df_source = _route_frame([
        {'date_naissance': '2010-06-01', 'qf_value': 650.0},   # eligible, kept in df_final
        {'date_naissance': '2010-06-01', 'qf_value': 650.0},   # eligible, dropped from df_final
        {'date_naissance': '2010-06-01', 'qf_value': 900.0},   # not eligible
        {'date_naissance': '2005-06-01', 'qf_value': 650.0},   # out of window
    ])
    df_final = df_source.drop(index=[1]).drop(columns=['qf_value'])

    mask = (df_source['qf_value'] < lib.QF_MAX) & (df_source['date_naissance'] >= lib.QF_DOB_MIN) \
        & (df_source['date_naissance'] <= lib.QF_DOB_MAX)
    with pytest.warns(UserWarning, match='reindexed'):
        expected = df_final[mask]

    result = lib.select_eligible_by_index(df_final, lib.qf_eligible_index(df_source))

    pd.testing.assert_frame_equal(result, expected)
