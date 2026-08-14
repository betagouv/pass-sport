"""CNAF-specific DataFrame processing for the clean_cnaf notebooks.

Everything the CNAF shares with the other partners routed through qf-batch lives one
folder up, in partners_lib.py: eligibility windows, deduplication, JSON serialization,
route selection. What is left here is what only the CNAF file looks like - its raw
column names, its address lines exploded across ADRLIG1..6, its trailing garbage row.

Extracted out of the notebooks so it can be unit tested (see test_clean_cnaf_lib.py).
They keep the I/O - env vars, CSV/parquet reads/writes, printed stats - and call these
functions in the same order as before.

Functions are pure: they take a DataFrame (plus explicit parameters) and return a new
one, never mutating their input and never touching the filesystem or os.environ.

The notebooks are split in two by the qf-batch checkpoint: phase 1 is
clean_cnaf_1_before_qf_batch.ipynb, phase 2 is clean_cnaf_2_after_qf_batch.ipynb, and
qf-batch.ts runs out-of-band between the two. Every phase 2 step is shared, so this
module only covers phase 1.
"""

import csv

import pandas as pd

import partners_lib as partners

# Positional column order of the raw CNAF export. Used to read the file ourselves rather
# than trust its own header row - see read_raw_cnaf_csv below for why.
CNAF_RAW_COLUMNS = [
    'CODORG', 'MATRICULE', 'QUALDOS', 'RESPDOS', 'NOMNAIDOS', 'PRENOMDOS', 'DTNAIDOS',
    'SEXDOS', 'COMMUNENAIDOS', 'PAYSNAIDOS', 'NOMCOMPLET', 'ADRLIG1DESTDOS', 'ADRLIG2DESTDOS',
    'ADRLIG3DESTDOS', 'ADRLIG4DESTDOS', 'ADRLIG5DESTDOS', 'ADRLIG6DESTDOS', 'NUMINSEE',
    'ADRMAIL', 'NUMTEL', 'NOMENF', 'PRENOMENF', 'DTNAIENF', 'SEXENF', 'ORIGINESELECTION',
]

CNAF_COLUMN_MAPPING = {
    # infos about allocataire
    'MATRICULE': 'allocataire-matricule',
    'CODORG': 'allocataire-code_organisme',
    'QUALDOS': 'allocataire-qualite',
    'RESPDOS': 'allocataire-nom',
    'PRENOMDOS': 'allocataire-prenom',
    'ADRMAIL': 'allocataire-courriel',
    'NUMTEL': 'allocataire-telephone',

    # allocataire pivot identity for the quotient_familial API call - filled by CNAF only
    # on ARS-origin rows, kept out of the site-facing 'allocataire-nom'/'allocataire-prenom'
    'NOMNAIDOS': 'allocataire-nom_naissance',
    'DTNAIDOS': 'allocataire-date_naissance',
    'SEXDOS': 'allocataire-genre',
    'COMMUNENAIDOS': 'allocataire-code_insee_naissance',
    'PAYSNAIDOS': 'allocataire-pays_naissance',

    # CNAF's own AAH/ARS/AEEH classification, replaces the previous DOB+name heuristic
    'ORIGINESELECTION': 'situation_origine',

    # adresse allocataire
    'CODE_POSTAL': 'adresse_allocataire-code_postal',
    'COMMUNE': 'adresse_allocataire-commune',
    'NUMINSEE': 'adresse_allocataire-code_insee',

    # infos about beneficiary
    'DTNAIENF': 'date_naissance',
    'SEXENF': 'genre',
    'NOMENF': 'nom',
    'PRENOMENF': 'prenom',
}

ORGANISME = 'CAF'

SITUATION_BY_ORIGIN = {'ARS': 'jeune', 'AAH': 'AAH', 'AEEH': 'AEEH'}

RAW_ADDRESS_COLUMNS_TO_DROP = [
    'NOMCOMPLET',
    'ADRLIG1DESTDOS',
    'ADRLIG2DESTDOS',
    'ADRLIG3DESTDOS',
    'ADRLIG4DESTDOS',
    'ADRLIG5DESTDOS',
    'ADRLIG6DESTDOS',
]


def read_raw_cnaf_csv(filepath: str) -> pd.DataFrame:
    """Read the raw CNAF export, ascii-encoded and semicolon-separated.

    Column names are supplied positionally (`names=CNAF_RAW_COLUMNS`, `header=None`) instead
    of being read from the file's own header row, because that header row is unreliable:
    CNAF's concatenation step has been known to truncate it to 200 of its 268 characters,
    silently dropping NUMINSEE onward. pandas doesn't raise on that - with fewer header
    names than data columns it folds the extra leading data columns into a MultiIndex, and
    every column after that point ends up holding the wrong values. Reading positionally
    sidesteps the header row's content entirely, so it is correct whether the row is 200,
    268, or any other number of characters.

    skiprows=2 drops the PASSPORT metadata row and the header row itself (never parsed).
    """
    return pd.read_csv(
        filepath, encoding='ascii', on_bad_lines='skip', sep=';', quoting=csv.QUOTE_NONE,
        dtype={column: 'str' for column in CNAF_RAW_COLUMNS}, engine='c',
        keep_default_na=False, names=CNAF_RAW_COLUMNS, header=None, skiprows=2,
    )


def clean_raw_cnaf(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the last row (it is not a valid row) and strip white spaces within all columns."""
    return partners.strip_all_string_columns(df.iloc[:-1])


def split_postal_code_and_commune(df: pd.DataFrame) -> pd.DataFrame:
    """Explode postal code & commune from the initial column containing both."""
    df = df.copy()
    df[['CODE_POSTAL', 'COMMUNE']] = df['ADRLIG5DESTDOS'].str.split(' ', n=1, expand=True)
    df[['CODE_POSTAL', 'COMMUNE']] = df[['CODE_POSTAL', 'COMMUNE']].transform(lambda x: x.str.strip())
    return df


def normalize_full_name_spacing(df: pd.DataFrame) -> pd.DataFrame:
    """Clean extra white spaces within NOMCOMPLET."""
    df = df.copy()
    df['NOMCOMPLET'] = df['NOMCOMPLET'].astype(str).str.replace(r'\s+', ' ', regex=True)
    return df


def map_cnaf_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename the raw CNAF columns to the PSP schema."""
    return df.rename(columns=CNAF_COLUMN_MAPPING)


def build_allocataire_address_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Additionnal address details and allocataire's street address, from the raw address lines."""
    df = df.copy()
    df['adresse_allocataire-cplt_adresse'] = (df['ADRLIG1DESTDOS'] + ' ' + df['ADRLIG2DESTDOS']).str.strip()
    df['adresse_allocataire-voie'] = (df['ADRLIG3DESTDOS'] + ' ' + df['ADRLIG4DESTDOS']).str.strip()
    return df


def set_organisme_and_situation(df: pd.DataFrame) -> pd.DataFrame:
    """Organism & situation - CNAF now flags the category itself, no more DOB+name guessing."""
    return partners.set_organisme_and_situation(df, ORGANISME, SITUATION_BY_ORIGIN)


def drop_raw_address_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove the raw name/address columns, now that they have been exploded and mapped."""
    return df.drop(columns=RAW_ADDRESS_COLUMNS_TO_DROP)
