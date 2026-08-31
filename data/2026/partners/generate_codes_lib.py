"""Code generation for the 2026 campaign, shared by generate_new_codes.ipynb and the cron.

Takes one cleaned file — CNAF, MSA, CNOUS or FC, each already through its own cleaning
notebook — adds the columns the production table expects, hands every row a brand new
pass Sport code, and writes the result to a dated file next to its input. The input file is
never modified in place.

The drawing of the codes and the bookkeeping of the campaign's code list are generic and
live in utils/codes_utils.py. What is dated to 2026, and therefore stays here, is
`EXERCICE_ID` and the set of default columns a production row carries.

⚠️ It deduplicates **codes**, never **beneficiaries**: running it twice on the same people
hands them two codes. Partner files are one-shot exports so the question does not arise, but
the FC source is a query against a live table and carries its own write-back step to mark
whoever has already been served — see franceconnect/README.md.

See test_generate_codes_lib.py for the unit tests.
"""

import csv
from pathlib import Path

import numpy as np
import pandas as pd

from utils.codes_utils import generate_unique_codes, load_existing_codes, save_codes
from utils.data_utils import get_current_date_for_file_name

# The 2026 campaign's row in the `exercice` table.
EXERCICE_ID = 5

# Beneficiary birthdates and code timestamps are read in Paris time by the site.
CAMPAIGN_TIMEZONE = 'Europe/Paris'

# Which cleaned file each source name refers to. Kept next to the generation itself so the
# notebook, the CLI and the cron all name their inputs the same way.
SOURCE_INPUT_ENV_VAR = {
    'CNAF': 'DB_CNAF_EXPORT_2026',
    # AAH/AEEH beneficiaries, split out so they can be coded and sent without waiting on
    # qf-batch — see cnaf/clean_cnaf_2a_aah_aeeh.ipynb. The QF-route CNAF source above never
    # recomputes them, so each beneficiary still goes through this step exactly once.
    'CNAF_AAH_AEEH': 'DB_CNAF_EXPORT_2026_AAH_AEEH',
    'MSA': 'DB_MSA_EXPORT_2026',
    'MSA_AAH_AEEH': 'DB_MSA_EXPORT_2026_AAH_AEEH',
    'CNOUS': 'DB_CNOUS_EXPORT_2026',
    # Not a partner file: the beneficiaries the site itself judged eligible without LCA
    # being able to serve them a code. Unlike the others, that source needs a write-back
    # step AFTER this one — see franceconnect/README.md.
    'FC': 'DB_FC_EXPORT_2026',
}


def dated_output_path(input_filepath, source: str) -> str:
    """The dated file this run writes, sitting next to its input.

    Both the notebook and the shell script derive the same path from the same rule, so the
    write-back step can find the file without anyone editing an environment variable by
    hand between two steps.
    """
    return str(
        Path(input_filepath).with_name(
            get_current_date_for_file_name(f"{source.lower()}-with-codes.csv")
        )
    )


def add_production_default_columns(df: pd.DataFrame, exercice_id: int = EXERCICE_ID,
                                   now: pd.Timestamp = None) -> pd.DataFrame:
    """Adds the columns the production table expects but no cleaning notebook produces.

    Every flag starts False: a code fresh out of this module has been neither validated nor
    refused, and its zrr/qpv status is decided later from the beneficiary's address.
    """
    df = df.copy()

    timestamp = now if now is not None else pd.Timestamp.now(tz=CAMPAIGN_TIMEZONE)

    df['exercice_id'] = exercice_id
    df['uuid_doc'] = np.nan
    df[['zrr', 'qpv', 'a_valider', 'refuser']] = False
    df[['created_at', 'updated_at']] = timestamp

    return df


def assign_new_codes(df: pd.DataFrame, existing_codes: set) -> pd.DataFrame:
    """Gives every row an `id_psp` no other row of the campaign holds."""
    df = df.copy()
    df['id_psp'] = generate_unique_codes(len(df), existing_codes)

    return df


def read_cleaned_file(input_filepath) -> pd.DataFrame:
    """Reads a cleaning notebook's output, everything as text.

    keep_default_na is necessary otherwise a string such as "NA" is considered as NaN...
    """
    return pd.read_csv(
        input_filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False,
        quoting=csv.QUOTE_ALL,
    )


def generate_codes_for_file(input_filepath, output_filepath, existing_codes_filepath) -> dict:
    """Runs the whole step: read, default columns, codes, write, track the codes used.

    The code list is rewritten only once the output file is safely on disk: a run that dies
    midway must not burn codes it never handed out.

    Returns the counts worth showing — the notebook prints them, the cron logs them.
    """
    df = read_cleaned_file(input_filepath)

    assert len(df[df['nom'].isna() | df['prenom'].isna()]) == 0
    assert 'id_psp' not in df.columns or df['id_psp'].eq('').all()

    existing_codes = load_existing_codes(existing_codes_filepath)

    df = add_production_default_columns(df)
    df = assign_new_codes(df, existing_codes)

    df.to_csv(output_filepath, sep=';', index=False, encoding='utf-8')

    tracked_codes = save_codes(existing_codes_filepath, existing_codes | set(df['id_psp']))
    assert tracked_codes == len(existing_codes) + len(df)

    return {
        'beneficiaires': len(df),
        'codes_generes': len(df),
        'genre_M': len(df[df['genre'] == 'M']),
        'genre_F': len(df[df['genre'] == 'F']),
        'par_organisme_situation': df[['organisme', 'situation']].value_counts(),
        'codes_suivis': tracked_codes,
        'sortie': str(output_filepath),
    }
