"""Unit tests for utils/emailing_utils.py.

Focused on clean_phone_number_in_place, whose prefixing rule is now shared with the
partner cleaning notebooks through data_utils.add_missing_leading_zero - these pin the
campaign-side contract it must keep (in-place, missing numbers emptied, count printed).

Run from data/: source .venv/bin/activate && pytest utils/test_emailing_utils.py
"""

import numpy as np
import pandas as pd
import pytest

from utils.emailing_utils import clean_phone_number_in_place


def test_clean_phone_number_in_place_prefixes_nine_digit_numbers():
    df = pd.DataFrame({'allocataire_telephone': ['612345678', '0612345678', '61234567']})

    returned = clean_phone_number_in_place(df)

    assert returned is None  # mutates in place
    assert df['allocataire_telephone'].tolist() == ['0612345678', '0612345678', '61234567']


def test_clean_phone_number_in_place_empties_missing_numbers():
    # campaign flavour: the CSV carries an empty cell, not a null
    df = pd.DataFrame({'allocataire_telephone': ['612345678', np.nan]})

    clean_phone_number_in_place(df)

    assert df['allocataire_telephone'].tolist() == ['0612345678', '']


def test_clean_phone_number_in_place_reports_how_many_were_cleaned(capsys):
    df = pd.DataFrame({'allocataire_telephone': ['612345678', '712345678', '0612345678', np.nan]})

    clean_phone_number_in_place(df)

    assert 'Number of beneficiaries with phone cleaned : 2' in capsys.readouterr().out


def test_clean_phone_number_in_place_honours_a_custom_column_name():
    df = pd.DataFrame({'telephone_alloc': ['612345678']})

    clean_phone_number_in_place(df, column_name='telephone_alloc')

    assert df['telephone_alloc'].tolist() == ['0612345678']
    assert df.columns.tolist() == ['telephone_alloc']


def test_clean_phone_number_in_place_rejects_a_missing_column():
    df = pd.DataFrame({'something_else': ['612345678']})

    with pytest.raises(ValueError):
        clean_phone_number_in_place(df)
