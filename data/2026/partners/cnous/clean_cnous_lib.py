"""CNOUS-specific DataFrame processing for clean_cnous.ipynb.

Everything the CNOUS shares with the other partners lives one folder up, in
partners_lib.py: whitespace stripping, required-field filtering, identity/email casing,
birthdate shifting, JSON serialization. What is left here is what only the CNOUS file
looks like - its 20 positional columns for 19 header names, its two date formats, its ISO
birth-country code, and the leading zeros its export drops from INSEE codes.

CNOUS is the one partner where the beneficiary *is* the allocataire: a boursier applies for
themselves, so there is no household to resolve and no quotient_familial call to make. The
file therefore never goes through qf-batch, and this module has no phase 1 / phase 2 split:
one notebook reads the raw export and writes the final rows, codes included.

Extracted out of the notebook so it can be unit tested (see test_clean_cnous_lib.py). The
notebook keeps the I/O - env vars, CSV reads/writes, printed stats - and calls these
functions in order.

Functions are pure: they take a DataFrame and return a new one, never mutating their input
and never touching the filesystem or os.environ.
"""

from datetime import datetime

import numpy as np
import pandas as pd

import partners_lib as partners
from utils.constants import ISO_TO_COUNTRY
from utils.data_utils import pad_insee_or_postal_codes, unaccent_and_upper

# The columns the CNOUS export delivers, in order. Read positionally (`names=` + `header=0`,
# see read_raw_cnous_csv) rather than from the file's own header row, which names only the
# first 19 of them: the trailing bourse échelon has no name. Handed to pandas as-is, that
# one missing name is enough to silently turn the first column into an index and shift every
# value one column to the left.
CNOUS_RAW_COLUMNS = [
    'date_naissance',
    'nom',
    'prenom',
    'genre',
    'allocataire-qualite',
    'allocataire-matricule',
    'allocataire-nom',
    'allocataire-prenom',
    'allocataire-courriel',
    # spelled 'adte' in the export's header row - the typo is the partner's, kept here so
    # the positional list stays a faithful description of the file
    'allocataire-adte_naissance',
    'allocataire-code_insee_commune_naissance',
    'allocataire-commune_naissance',
    'allocataire-code_iso_pays_naissance',
    'adresse-allocataire_voie',
    'adresse-allocataire_code_postal',
    'adresse-allocataire_commune',
    'adresse-allocataire_code_insee',
    'adresse-allocataire_cplt_adresse',
    'allocataire-courriel_2',
    # the 20th column, unnamed in the header row: the bourse échelon (0Bis, 1, 2... 7). Read
    # so the columns line up, then dropped - it is not an eligibility criterion.
    'echelon',
]

CNOUS_COLUMN_MAPPING = {
    'allocataire-adte_naissance': 'allocataire-date_naissance',
    'allocataire-code_insee_commune_naissance': 'allocataire-code_insee_naissance',
    'adresse-allocataire_voie': 'adresse_allocataire-voie',
    'adresse-allocataire_code_postal': 'adresse_allocataire-code_postal',
    'adresse-allocataire_commune': 'adresse_allocataire-commune',
    'adresse-allocataire_code_insee': 'adresse_allocataire-code_insee',
    'adresse-allocataire_cplt_adresse': 'adresse_allocataire-cplt_adresse',
}

ORGANISME = 'cnous'

# Every row of the file is a scholarship holder: unlike CNAF and MSA, CNOUS has no column
# splitting its beneficiaries across eligibility routes.
SITUATION = 'boursier'

# Boursier window for the 2026 campaign, whole years: 28 ans révolus at the youngest end of
# the range down to those born during the campaign year itself.
CNOUS_DOB_MIN = datetime(1998, 1, 1)
CNOUS_DOB_MAX = datetime(2026, 12, 31)

# The codes the export writes for a birth in France on top of the ISO 'FR': an empty cell,
# and the numeric 100 an older version of the file used.
FRANCE_ISO_CODE = 'FR'
LEGACY_FRANCE_ISO_CODES = ['', '100']

# The allocataire columns the shared JSON serializer indexes but the CNOUS file does not
# carry - see add_missing_allocataire_columns.
MISSING_ALLOCATAIRE_COLUMNS = ['allocataire-code_organisme', 'allocataire-telephone']

# What CNOUS keeps in its allocataire JSON on top of partners' shared core: the boursier's
# own birth details, which are also the allocataire's since the two are the same person.
# Values are taken verbatim, so every column listed here must already have its final shape
# when the JSON column is built.
ALLOCATAIRE_JSON_EXTRA_FIELDS = {
    'date_naissance': 'allocataire-date_naissance',
    'code_insee_commune_naissance': 'allocataire-code_insee_naissance',
    'commune_naissance': 'allocataire-commune_naissance',
    'code_iso_pays_naissance': 'allocataire-code_iso_pays_naissance',
    'pays_naissance': 'allocataire-pays_naissance',
}

# INSEE and postal codes the export can deliver stripped of their leading zero.
INSEE_CODE_COLUMNS = [
    'allocataire-code_insee_naissance',
    'adresse_allocataire-code_postal',
    'adresse_allocataire-code_insee',
]

# Free-text address fields: blanked rather than left empty so the JSON serializer, which
# only drops nulls, does not carry a `"voie": ""` into production.
ADDRESS_TEXT_COLUMNS = [
    'adresse_allocataire-voie',
    'adresse_allocataire-commune',
    'adresse_allocataire-cplt_adresse',
]

# The production row this notebook writes. The first 8 are exactly the columns CNAF and MSA
# hand to step ③; CNOUS carries the remaining 9 itself, since it draws its own codes.
CNOUS_OUTPUT_COLUMNS = [
    'nom',
    'prenom',
    'date_naissance',
    'genre',
    'organisme',
    'situation',
    'allocataire',
    'adresse_allocataire',
    'created_at',
    'updated_at',
    'exercice_id',
    'uuid_doc',
    'zrr',
    'qpv',
    'a_valider',
    'refuser',
    'id_psp',
]


def read_raw_cnous_csv(filepath) -> pd.DataFrame:
    """Read the raw CNOUS export, utf-8 and semicolon-separated.

    Column names are supplied positionally (`names=CNOUS_RAW_COLUMNS`, `header=0`) rather
    than read from the file's own header row: that row names 19 columns for 20 delivered
    fields, and pandas answers a short header by promoting the surplus leading column to an
    index instead of raising, which shifts every value one column to the left. `header=0`
    still skips the row itself.

    on_bad_lines='warn' rather than 'skip': a row whose field count does not match is a
    real problem now that the count is pinned, and the warning names its line number in the
    run report instead of losing a beneficiary silently.
    """
    return pd.read_csv(
        filepath, encoding='utf-8', sep=';', engine='c', dtype=str,
        names=CNOUS_RAW_COLUMNS, header=0, on_bad_lines='warn',
    )


def map_cnous_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename the raw CNOUS columns to the PSP schema.

    Most of them already carry their PSP name; what this fixes is the export's
    'adte_naissance' typo, the birth-commune column CNOUS spells out in full, and the
    'adresse-allocataire_x' prefix where the schema wants 'adresse_allocataire-x'.

    Raises with the list of missing columns rather than letting the first step that needs
    one fail on a bare KeyError, which says nothing about what the file actually held.
    """
    missing = [column for column in CNOUS_COLUMN_MAPPING if column not in df.columns]
    if missing:
        raise ValueError(
            f"{len(missing)} expected CNOUS column(s) missing from the file: {missing}. "
            f"Got: {list(df.columns)}")

    return df.rename(columns=CNOUS_COLUMN_MAPPING)


def set_organisme_and_situation(df: pd.DataFrame) -> pd.DataFrame:
    """Organism & situation, both constant.

    partners.set_organisme_and_situation reads the situation off a 'situation_origine'
    column holding the partner's own route label; CNOUS has no such column because it has
    no routes - every row of the file is a boursier.
    """
    df = df.copy()
    df['organisme'] = ORGANISME
    df['situation'] = SITUATION
    return df


def normalize_allocataire_birthdate(df: pd.DataFrame) -> pd.DataFrame:
    """Allocataire birthdate: %d/%m/%Y round trip, so a malformed date cannot reach the JSON.

    The column is kept as text, in the format it arrives in and that the allocataire JSON
    has carried since 2025 - only the beneficiary's own 'date_naissance' becomes a datetime,
    the eligibility window being applied on it. Unparsable values become NaN, which the JSON
    serializer drops.
    """
    df = df.copy()
    df['allocataire-date_naissance'] = pd.to_datetime(
        df['allocataire-date_naissance'], format='%d/%m/%Y', errors='coerce'
    ).dt.strftime('%d/%m/%Y')
    return df


def fill_default_birth_country_iso(df: pd.DataFrame) -> pd.DataFrame:
    """A missing or legacy birth-country code means France.

    The export leaves the cell empty for a French birth, and an older version of the file
    wrote the numeric 100 for it. Anything else is a real foreign ISO code and is only
    uppercased.
    """
    df = df.copy()
    iso = df['allocataire-code_iso_pays_naissance'].str.upper()
    df['allocataire-code_iso_pays_naissance'] = iso.where(
        iso.notna() & ~iso.isin(LEGACY_FRANCE_ISO_CODES), FRANCE_ISO_CODE)
    return df


def add_birth_country_label(df: pd.DataFrame) -> pd.DataFrame:
    """Birth country name, read off the ISO code (FR -> FRANCE, MA -> MOROCCO).

    An ISO code absent from the reference table leaves the label null rather than raising:
    utils.data_utils.get_country_from_iso subscripts ISO_TO_COUNTRY directly and would kill
    a whole run over one unexpected code. A null label is simply dropped from the JSON.
    """
    df = df.copy()
    df['allocataire-pays_naissance'] = df['allocataire-code_iso_pays_naissance'].map(
        lambda iso: ISO_TO_COUNTRY[iso].upper() if iso in ISO_TO_COUNTRY else np.nan)
    return df


def normalize_birthplace_casing(df: pd.DataFrame) -> pd.DataFrame:
    """Upper case the birth commune, which the export delivers in lower case.

    Accents are kept, unlike the postal address: this label is only ever displayed, never
    matched against a reference file.
    """
    df = df.copy()
    df['allocataire-commune_naissance'] = df['allocataire-commune_naissance'].str.upper()
    return df


def pad_insee_codes(df: pd.DataFrame) -> pd.DataFrame:
    """Restore the leading zero the export drops from INSEE and postal codes.

    The birth commune of the Ain comes back as 1289 where it should read 01289. Applied on
    the frame rather than at serialization time because the allocataire JSON takes its extra
    fields verbatim - unlike the address JSON, they never pass through
    format_insee_or_postal_code. A Corsican or overseas code carrying a letter is left alone.
    """
    df = df.copy()
    for column in INSEE_CODE_COLUMNS:
        df[column] = pad_insee_or_postal_codes(df[column])
    return df


def normalize_address_casing(df: pd.DataFrame) -> pd.DataFrame:
    """Unaccent and upper case the address text, and blank out what is left empty.

    CNOUS addresses are stored upper case and ascii-folded, which CNAF and MSA do not do -
    hence a CNOUS step rather than a shared one. Double quotes in a street name become
    single ones, a habit from the days the export was not quoted at all.

    Emptying blank fields is what keeps the shared JSON serializer, which only drops nulls,
    from writing a `"voie": ""` into production.
    """
    df = df.copy()

    for column in ADDRESS_TEXT_COLUMNS:
        text = df[column].str.strip().map(unaccent_and_upper, na_action='ignore')
        df[column] = text.mask(text == '', np.nan)

    df['adresse_allocataire-voie'] = df['adresse_allocataire-voie'].str.replace('"', "'")

    return df


def add_missing_allocataire_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add, empty, the allocataire columns the shared JSON serializer indexes.

    CNOUS delivers neither a code organisme nor a telephone number, but
    partners.to_json_allocataire_without_null reads both off every row. Null they are
    dropped from the JSON, so the output is the same as if the serializer had never looked
    for them.

    Call this right before serializing: any earlier and the `dropna(axis=1, how='all')` of
    partners.filter_rows_missing_required_fields removes these all-null columns again, and
    the serializer fails on a KeyError.
    """
    df = df.copy()
    for column in MISSING_ALLOCATAIRE_COLUMNS:
        df[column] = np.nan
    return df


def filter_within_birthdate_window(
    df: pd.DataFrame, dob_min: datetime = CNOUS_DOB_MIN, dob_max: datetime = CNOUS_DOB_MAX
) -> tuple[pd.DataFrame, int]:
    """Keep the beneficiaries born within the campaign's boursier window, bounds included.

    Returns (df, removed_count).
    """
    birthdates = pd.to_datetime(df['date_naissance'])
    df_within = df[(birthdates >= dob_min) & (birthdates <= dob_max)]
    return df_within, len(df) - len(df_within)


def describe_rows_outside_window(
    df: pd.DataFrame,
    dob_min: datetime = CNOUS_DOB_MIN,
    dob_max: datetime = CNOUS_DOB_MAX,
    campaign_year: int = partners.CAMPAIGN_YEAR,
) -> pd.DataFrame:
    """The rows filter_within_birthdate_window drops, for logging them one by one.

    Kept next to the filter and taking the same bounds, so the notebook can print why each
    beneficiary was rejected - their birthdate and the age it makes them reach during the
    campaign year. Returns an empty frame with those columns when nothing is out of the
    window.
    """
    birthdates = pd.to_datetime(df['date_naissance'])
    mask_outside = (birthdates < dob_min) | (birthdates > dob_max)

    return pd.DataFrame({
        'date_naissance': birthdates[mask_outside].dt.strftime('%d/%m/%Y'),
        f'age_en_{campaign_year}': campaign_year - birthdates[mask_outside].dt.year,
    })


def drop_duplicates_on_key(df: pd.DataFrame, column: str) -> tuple[pd.DataFrame, int]:
    """Keep the first row of each value of `column`, leaving rows without a value untouched.

    A plain drop_duplicates would not do: pandas holds two nulls to be equal, so applied to
    the courriel - null for every boursier the export has no address for - it would collapse
    all of them into a single beneficiary. Only rows actually sharing a value are candidates.

    Returns (df, dropped_count).
    """
    has_key = df[column].notna()
    duplicated = has_key & df[column].duplicated(keep='first')

    return df[~duplicated], int(duplicated.sum())


def select_output_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Keep the production columns, in the order the injection expects them.

    A positive selection rather than partners.drop_intermediate_columns: the
    `dropna(axis=1, how='all')` upstream can already have removed a column that was empty
    throughout the file, which a drop(columns=...) would then fail on.
    """
    return df[CNOUS_OUTPUT_COLUMNS]
