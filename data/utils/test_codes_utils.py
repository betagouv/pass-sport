"""Unit tests for the code generation helpers in utils/codes_utils.py.

Run from data/: source .venv/bin/activate && pytest utils/test_codes_utils.py
"""

import re
from datetime import date

import pandas as pd

from utils.codes_utils import (
    CODE_ALPHABET,
    current_year_suffix,
    generate_unique_codes,
    load_existing_codes,
    save_codes,
)

CODE_PATTERN = re.compile(r'^\d{2}-[A-Z]{4}-[A-Z]{4}$')


def test_generate_unique_codes_shape_and_count():
    codes = generate_unique_codes(50, existing_codes=set(), year_suffix='26')

    assert len(codes) == 50
    assert all(CODE_PATTERN.match(code) for code in codes)
    assert all(code.startswith('26-') for code in codes)


def test_generate_unique_codes_are_distinct():
    codes = generate_unique_codes(500, existing_codes=set(), year_suffix='26')

    assert len(set(codes)) == 500


def test_generate_unique_codes_never_collide_with_existing_ones():
    existing = set(generate_unique_codes(200, existing_codes=set(), year_suffix='26'))

    codes = generate_unique_codes(200, existing_codes=existing, year_suffix='26')

    assert not existing.intersection(codes)


def test_generate_unique_codes_avoids_letters_read_as_digits():
    # 'O' and 'I' would be typed as 0 and 1 at the point of sale
    codes = generate_unique_codes(300, existing_codes=set(), year_suffix='26')

    letters = ''.join(code.replace('-', '')[2:] for code in codes)
    assert 'O' not in letters
    assert 'I' not in letters
    assert set(letters).issubset(set(CODE_ALPHABET))


def test_generate_unique_codes_defaults_to_the_current_year():
    codes = generate_unique_codes(1, existing_codes=set())

    assert codes[0].startswith(f"{current_year_suffix()}-")


def test_current_year_suffix():
    assert current_year_suffix(date(2026, 8, 12)) == '26'


def test_load_existing_codes_when_the_file_does_not_exist_yet(tmp_path):
    # first run of a campaign: no code has ever been handed out
    assert load_existing_codes(tmp_path / 'nope.csv') == set()


def test_save_then_load_codes_round_trip(tmp_path):
    filepath = tmp_path / 'codes.csv'

    tracked = save_codes(filepath, ['26-BBBB-BBBB', '26-AAAA-AAAA'])

    assert tracked == 2
    assert load_existing_codes(filepath) == {'26-AAAA-AAAA', '26-BBBB-BBBB'}
    # sorted, so two runs of the same campaign produce a readable diff
    assert list(pd.read_csv(filepath)['code']) == ['26-AAAA-AAAA', '26-BBBB-BBBB']


def test_save_codes_deduplicates(tmp_path):
    filepath = tmp_path / 'codes.csv'

    tracked = save_codes(filepath, ['26-AAAA-AAAA', '26-AAAA-AAAA'])

    assert tracked == 1
