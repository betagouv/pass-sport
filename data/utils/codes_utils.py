"""Generation and bookkeeping of the pass Sport codes handed out to beneficiaries.

A code looks like `26-ABCD-EFGH`: the campaign's two-digit year, then two groups of four
letters. It is read aloud and typed by hand at the point of sale, so the alphabet drops the
two letters a human eye confuses with digits.

Uniqueness is not enforced by a database at generation time — the codes are generated here
and injected in bulk later — so it rests entirely on a single-column CSV listing every code
already handed out this campaign. That file is read before generating anything and rewritten
afterwards, which is what keeps successive runs (one per partner file, one per CNOUS wave,
one per FranceConnect batch) from colliding.

Nothing here is dated or partner-specific: the year is a parameter, and the caller owns the
path of the code list. See test_codes_utils.py for the unit tests.
"""

import random
import string
from datetime import date
from pathlib import Path
from typing import Iterable, Set

import pandas as pd

# 'O' and 'I' are left out: on paper and read out loud they are the digits 0 and 1.
CODE_ALPHABET = [c for c in string.ascii_uppercase if c not in 'OI']

CODE_GROUP_SIZE = 4

# The single column of the code-tracking CSV.
CODE_COLUMN = 'code'


def current_year_suffix(today: date = None) -> str:
    """The two-digit year a code is prefixed with ('26' for the 2026 campaign)."""
    return str((today or date.today()).year)[-2:]


def _random_group(size: int = CODE_GROUP_SIZE) -> str:
    return ''.join(random.choices(CODE_ALPHABET, k=size))


def generate_code(year_suffix: str) -> str:
    """Draws one code, with no uniqueness guarantee — see generate_unique_codes."""
    return f"{year_suffix}-{_random_group()}-{_random_group()}"


def generate_unique_codes(count: int, existing_codes: Iterable[str],
                          year_suffix: str = None) -> list:
    """Draws `count` codes, all new and all distinct from each other.

    Draws into a set seeded with the existing codes, so a collision — with an already
    handed-out code or with a code drawn a moment ago — is simply swallowed and the loop
    keeps going until `count` new ones have come out. With 24^8 possibilities against a
    campaign's few hundred thousand codes, that loop terminates immediately in practice.
    """
    year_suffix = year_suffix or current_year_suffix()
    existing = set(existing_codes)

    drawn = set(existing)
    while len(drawn) < len(existing) + count:
        drawn.add(generate_code(year_suffix))

    new_codes = sorted(drawn - existing)
    assert len(new_codes) == count

    return new_codes


def load_existing_codes(filepath) -> Set[str]:
    """Reads the codes already handed out this campaign, tolerating a missing file.

    The file legitimately does not exist yet on the very first run of a campaign, which is
    not an error: it starts from an empty list and gets written at the end of that run.
    """
    if not Path(filepath).exists():
        return set()

    df_existing = pd.read_csv(
        filepath, sep=',', encoding='utf-8', dtype=str, keep_default_na=False,
        engine='c', on_bad_lines='skip',
    )

    return set(df_existing[CODE_COLUMN])


def save_codes(filepath, codes: Iterable[str]) -> int:
    """Rewrites the campaign's code list, sorted. Returns how many codes it now holds."""
    df_codes = pd.DataFrame({CODE_COLUMN: sorted(set(codes))})
    df_codes.to_csv(filepath, sep=',', index=False, encoding='utf-8')

    return len(df_codes)
