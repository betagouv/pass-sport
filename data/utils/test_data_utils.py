"""Unit tests for the shared helpers in utils/data_utils.py.

Run from data/: source .venv/bin/activate && pytest utils/test_data_utils.py
"""

import numpy as np
import pandas as pd

from utils.data_utils import (
    add_missing_leading_zero,
    build_country_cog_lookup,
    drop_rows_missing_values,
    normalize_country_label,
    shift_dates_by_hours,
)


def test_add_missing_leading_zero():
    phone = pd.Series(['612345678', '0612345678', '61234567', '12345678901'])

    result = add_missing_leading_zero(phone)

    assert result.iloc[0] == '0612345678'
    # already prefixed, or not 9 digits: untouched
    assert result.iloc[1] == '0612345678'
    assert result.iloc[2] == '61234567'
    assert result.iloc[3] == '12345678901'


def test_add_missing_leading_zero_keeps_missing_numbers_null():
    # the partner notebooks rely on this: a null phone must not become '' or '0...'
    phone = pd.Series(['612345678', np.NaN, None])

    result = add_missing_leading_zero(phone)

    assert result.iloc[0] == '0612345678'
    assert pd.isna(result.iloc[1])
    assert pd.isna(result.iloc[2])


def test_add_missing_leading_zero_does_not_mutate_its_input():
    phone = pd.Series(['612345678'])

    add_missing_leading_zero(phone)

    assert phone.iloc[0] == '612345678'


def test_shift_dates_by_hours():
    dates = pd.to_datetime(pd.Series(['2010-03-15', '2010-12-31']))

    result = shift_dates_by_hours(dates, 4)

    assert result.tolist() == [pd.Timestamp('2010-03-15 04:00:00'), pd.Timestamp('2010-12-31 04:00:00')]


def test_drop_rows_missing_values_drops_incomplete_rows():
    df = pd.DataFrame({
        'nom': ['DUPONT', 'MARTIN', 'DURAND'],
        'prenom': ['Jean', 'Marie', 'Paul'],
        'genre': ['M', np.NaN, 'M'],
        'date_naissance': [pd.Timestamp('2010-01-01'), pd.Timestamp('2011-01-01'), pd.NaT],
    })

    result = drop_rows_missing_values(df, ['nom', 'prenom', 'genre', 'date_naissance'])

    assert result['nom'].tolist() == ['DUPONT']


def test_drop_rows_missing_values_drops_columns_left_entirely_null():
    df = pd.DataFrame({
        'nom': ['DUPONT', 'MARTIN'],
        'always_empty': [np.NaN, np.NaN],
        'sometimes_empty': ['value', np.NaN],
    })

    result = drop_rows_missing_values(df, ['nom'])

    assert 'always_empty' not in result.columns
    assert 'sometimes_empty' in result.columns


def test_normalize_country_label_keeps_words_apart_across_punctuation():
    # the ascii fold alone would drop the apostrophe and glue the words together
    assert normalize_country_label("Côte d'Ivoire") == 'COTE D IVOIRE'
    assert normalize_country_label('Côte d’Ivoire') == 'COTE D IVOIRE'


def test_normalize_country_label_folds_accents_and_spacing():
    assert normalize_country_label('  République   française ') == 'REPUBLIQUE FRANCAISE'
    assert normalize_country_label('') == ''


def _cog_reference_frame():
    return pd.DataFrame({
        'COG': ['99100', '99350', '99999'],
        'LIBCOG': ['France', 'Maroc', ''],
        'LIBENR': ['République française', 'Royaume du Maroc', ''],
    })


def test_build_country_cog_lookup_indexes_both_spellings():
    lookup = build_country_cog_lookup(_cog_reference_frame())

    assert lookup['FRANCE'] == '99100'
    assert lookup['REPUBLIQUE FRANCAISE'] == '99100'
    assert lookup['ROYAUME DU MAROC'] == '99350'


def test_build_country_cog_lookup_skips_empty_labels():
    lookup = build_country_cog_lookup(_cog_reference_frame())

    assert '' not in lookup.index
    assert '99999' not in lookup.tolist()
