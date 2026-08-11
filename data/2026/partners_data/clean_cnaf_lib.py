"""DataFrame processing logic for clean_cnaf.ipynb.

Extracted out of the notebook so it can be unit tested (see test_clean_cnaf_lib.py).
The notebook keeps the I/O - env vars, CSV reads/writes, printed stats - and calls
these functions in the same order as before.

Functions are pure: they take a DataFrame (plus explicit parameters) and return a new
one, never mutating their input and never touching the filesystem or os.environ. The
few steps that used to print a count return it instead, so the notebook can print it
and a test can assert on it.

Section order below follows the notebook's own cell order, split in two by the qf-batch
checkpoint (qf-batch.ts runs out-of-band between phase 1 and phase 2).
"""

import json
from datetime import datetime

import numpy as np
import pandas as pd

from utils.data_utils import (
    add_missing_leading_zero,
    # re-exported for the notebook, which builds the COG lookup itself: the reference
    # file and the label folding are national, not CNAF-specific
    build_country_cog_lookup,
    drop_rows_missing_values,
    format_insee_or_postal_code,
    normalize_country_label,
    shift_dates_by_hours,
    unaccent_and_upper,
)

# --- Eligibility windows ----------------------------------------------------------

# QF route age window: 6-17 ans révolus.
QF_DOB_MIN = datetime(2009, 1, 1)
QF_DOB_MAX = datetime(2020, 12, 31)
QF_MAX = 700  # quotient familial strictly below this value

# AAH route: 16-30 ans révolus. AAH_DOB_MIN doubles as the preliminary filter applied
# ahead of the 3 precise windows, being the oldest birthdate any route can accept.
AAH_DOB_MIN = datetime(1996, 1, 1)
AAH_DOB_MAX = datetime(2010, 12, 31)

# AEEH route: 6-19 ans révolus.
AEEH_DOB_MIN = datetime(2007, 1, 1)
AEEH_DOB_MAX = datetime(2020, 12, 31)

# INSEE COG code for France, in the v_pays_territoire reference file.
FRANCE_COG = '99100'


# --- Phase 1: pre-checkpoint ------------------------------------------------------

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

PHONE_PLACEHOLDER_REPLACEMENTS = {
    '0000000000': np.NaN,
    '0600000000': np.NaN,
    '0700000001': np.NaN,
    '0100000000': np.NaN,
    '0400000000': np.NaN,
    '0600000001': np.NaN,
    '0700000000': np.NaN,
}

QUALITE_NORMALIZATION = {'MME': 'Mme', 'MR': 'M'}

SITUATION_BY_ORIGIN = {'ARS': 'jeune', 'AAH': 'AAH', 'AEEH': 'AEEH'}

QF_BATCH_COLUMNS = [
    'allocataire-matricule',
    'allocataire-code_organisme',
    'allocataire-nom_naissance',
    'allocataire-nom_usage',
    'allocataire-prenom',
    'allocataire-date_naissance',
    'allocataire-genre',
    'allocataire-code_insee_naissance',
    'allocataire-code_pays_naissance',
]

RAW_ADDRESS_COLUMNS_TO_DROP = [
    'NOMCOMPLET',
    'ADRLIG1DESTDOS',
    'ADRLIG2DESTDOS',
    'ADRLIG3DESTDOS',
    'ADRLIG4DESTDOS',
    'ADRLIG5DESTDOS',
    'ADRLIG6DESTDOS',
]

# Without one of these we cannot generate a code for the beneficiary.
NECESSARY_COLUMNS = ['nom', 'prenom', 'date_naissance', 'genre']

DEDUPLICATION_KEY_COLUMNS = [
    'date_naissance',
    'nom',
    'prenom',
    'genre',
    'organisme',
    'situation',
    'allocataire-qualite',
    'allocataire-matricule',
    'allocataire-code_organisme',
    'allocataire-telephone',
    'allocataire-nom',
    'allocataire-prenom',
    'allocataire-courriel',
]

FINAL_COLUMNS_TO_DROP = [
    'allocataire-qualite',
    'allocataire-matricule',
    'allocataire-code_organisme',
    'allocataire-nom',
    'allocataire-prenom',
    'allocataire-telephone',
    'allocataire-courriel',
    'adresse_allocataire-voie',
    'adresse_allocataire-code_postal',
    'adresse_allocataire-commune',
    'adresse_allocataire-code_insee',
    'adresse_allocataire-cplt_adresse',
    # qf-batch pivot-only columns, not part of the site-facing DB schema
    'situation_origine',
    'allocataire-nom_naissance',
    'allocataire-date_naissance',
    'allocataire-genre',
    'allocataire-code_insee_naissance',
    'allocataire-pays_naissance',
]


def clean_raw_cnaf(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the last row (it is not a valid row) and strip white spaces within all columns."""
    df = df.iloc[:-1].copy()
    for col in df.columns:
        df[col] = df[col].str.strip()
    return df


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


def clear_placeholder_phone_numbers(df: pd.DataFrame) -> pd.DataFrame:
    """Allocataire missing phone number: known placeholders become NaN."""
    df = df.copy()
    df['allocataire-telephone'] = df['allocataire-telephone'].replace(PHONE_PLACEHOLDER_REPLACEMENTS)
    return df


def normalize_allocataire_qualite(df: pd.DataFrame) -> pd.DataFrame:
    """Allocataire's qualite: MME/MR -> Mme/M."""
    df = df.copy()
    df['allocataire-qualite'] = df['allocataire-qualite'].str.strip().replace(QUALITE_NORMALIZATION)
    return df


def build_allocataire_address_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Additionnal address details and allocataire's street address, from the raw address lines."""
    df = df.copy()
    df['adresse_allocataire-cplt_adresse'] = (df['ADRLIG1DESTDOS'] + ' ' + df['ADRLIG2DESTDOS']).str.strip()
    df['adresse_allocataire-voie'] = (df['ADRLIG3DESTDOS'] + ' ' + df['ADRLIG4DESTDOS']).str.strip()
    return df


def set_organisme_and_situation(df: pd.DataFrame) -> pd.DataFrame:
    """Organism & situation - CNAF now flags the category itself, no more DOB+name guessing."""
    df = df.copy()
    df['organisme'] = 'CAF'
    df['situation'] = df['situation_origine'].map(SITUATION_BY_ORIGIN)
    return df


def parse_beneficiary_birthdate(df: pd.DataFrame) -> pd.DataFrame:
    """Format date_naissance to datetime python object for processing."""
    df = df.copy()
    df['date_naissance'] = pd.to_datetime(df['date_naissance'], format='%d/%m/%Y')
    return df


def select_qf_route_allocataires(
    df: pd.DataFrame, dob_min: datetime = QF_DOB_MIN, dob_max: datetime = QF_DOB_MAX
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Only ARS-origin rows carry the allocataire pivot identity needed for quotient_familial.

    One call per household, not per child, since several beneficiary rows can share the
    same allocataire. The DOB window is applied here so we never spend a quotient_familial
    call on a household with no child in the window - the same bounds are re-applied per
    beneficiary row later (an eligible household can also hold children outside the window).

    Returns (df_qf_allocataires, df_qf_route): the deduplicated households, and the rows
    they were deduplicated from - the caller reports how many in-window ARS rows there were.
    """
    mask_qf_route = (
        (df['situation_origine'] == 'ARS')
        & (df['date_naissance'] >= dob_min)
        & (df['date_naissance'] <= dob_max)
    )
    df_qf_route = df[mask_qf_route]
    df_qf_allocataires = df_qf_route.drop_duplicates(
        subset=['allocataire-code_organisme', 'allocataire-matricule']).copy()
    return df_qf_allocataires, df_qf_route


def format_qf_identity_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Shape the allocataire pivot identity the way qf-batch.ts expects it."""
    df = df.copy()
    df['allocataire-nom_usage'] = df['allocataire-nom']
    df['allocataire-genre'] = df['allocataire-genre'].map({'M': 'male', 'F': 'female'})
    df['allocataire-date_naissance'] = pd.to_datetime(
        df['allocataire-date_naissance'], format='%d/%m/%Y', errors='coerce').dt.strftime('%Y-%m-%d')
    return df


def map_birth_country_to_cog(df: pd.DataFrame, cog_by_country_label: pd.Series) -> tuple[pd.DataFrame, list]:
    """Turn CNAF's PAYSNAIDOS label into a COG code (France -> 99100, Maroc -> 99350...).

    PAYSNAIDOS holds the country *label* (FRANCE, MAROC, PORTUGAL...), not a code.

    Returns (df, unmapped_labels): the non-empty labels without a COG match, for the
    caller to report.
    """
    df = df.copy()
    pays_naissance_label = df['allocataire-pays_naissance'].map(normalize_country_label)
    df['allocataire-code_pays_naissance'] = pays_naissance_label.map(cog_by_country_label)

    unmapped_labels = sorted(set(pays_naissance_label[
        (pays_naissance_label != '') & df['allocataire-code_pays_naissance'].isna()]))
    return df, unmapped_labels


def clear_foreign_birthplace_insee(df: pd.DataFrame, france_cog: str = FRANCE_COG) -> tuple[pd.DataFrame, int]:
    """code_insee_naissance only makes sense for a birth in France.

    COMMUNENAIDOS holds a free-text foreign locality for the others, which is not an INSEE
    commune code. Dropped for every non-France COG (unmapped/empty labels included, since
    we can't assert France).

    Returns (df, cleared_count).
    """
    df = df.copy()
    mask_born_abroad = df['allocataire-code_pays_naissance'] != france_cog
    df.loc[mask_born_abroad, 'allocataire-code_insee_naissance'] = np.NaN
    return df, int(mask_born_abroad.sum())


def select_qf_batch_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only the columns qf-batch.ts reads."""
    return df[QF_BATCH_COLUMNS]


def drop_raw_address_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove the raw name/address columns, now that they have been exploded and mapped."""
    return df.drop(columns=RAW_ADDRESS_COLUMNS_TO_DROP)


def filter_rows_missing_required_fields(df: pd.DataFrame, required_columns: list = None) -> pd.DataFrame:
    """Remove rows with missing necessary values, then columns with all null values.

    If one of those values is missing we cannot generate a code for the beneficiary.
    """
    required_columns = NECESSARY_COLUMNS if required_columns is None else required_columns
    return drop_rows_missing_values(df, required_columns)


def normalize_identity_casing(df: pd.DataFrame) -> pd.DataFrame:
    """Upper case prenom, nom and genre for the merge."""
    df = df.copy()
    df['prenom'] = df['prenom'].astype(str).apply(unaccent_and_upper)
    df['nom'] = df['nom'].astype(str).apply(unaccent_and_upper)
    df['genre'] = df['genre'].astype(str).apply(unaccent_and_upper)
    return df


def normalize_email_casing(df: pd.DataFrame) -> pd.DataFrame:
    """Lower case on emails on all."""
    df = df.copy()
    df['allocataire-courriel'] = df['allocataire-courriel'].str.lower()
    return df


def filter_within_eligibility_floor(df: pd.DataFrame, floor_date: datetime = AAH_DOB_MIN) -> pd.DataFrame:
    """Preliminary filter, ahead of the precise QF/AAH/AEEH windows applied later.

    floor_date defaults to AAH's lower bound, the oldest birthdate any of the 3 routes
    can accept.
    """
    mask_after_floor = pd.to_datetime(df['date_naissance']) >= floor_date
    return df[mask_after_floor]


def fix_phone_number_formatting(df: pd.DataFrame) -> pd.DataFrame:
    """Add the missing 0 to 9-digit phone numbers, and set '0' phone values to NaN.

    Missing numbers stay NaN: they are excluded from the LM mailing campaign, and the
    allocataire JSON drops null values rather than carrying an empty telephone.
    """
    df = df.copy()

    df['allocataire-telephone'] = add_missing_leading_zero(df['allocataire-telephone'])

    mask_tel_eq_zero = df['allocataire-telephone'] == '0'
    df.loc[mask_tel_eq_zero, 'allocataire-telephone'] = np.NaN

    return df


def clear_blank_email(df: pd.DataFrame) -> pd.DataFrame:
    """Set NaN values for not existing courriel."""
    df = df.copy()
    mask_email_not_existing = df['allocataire-courriel'] == ''
    df.loc[mask_email_not_existing, 'allocataire-courriel'] = np.NaN
    return df


def shift_birthdate_by_hours(df: pd.DataFrame, hours: int = 4) -> pd.DataFrame:
    """Add 4h on all birthdates."""
    df = df.copy()
    df['date_naissance'] = shift_dates_by_hours(df['date_naissance'], hours)
    return df


def drop_duplicate_beneficiaries(df: pd.DataFrame, subset_columns: list = None) -> tuple[pd.DataFrame, int]:
    """Remove duplicate beneficiaries.

    Returns (df, dropped_count).
    """
    subset_columns = DEDUPLICATION_KEY_COLUMNS if subset_columns is None else subset_columns

    df_no_duplicate = df.drop_duplicates(subset=subset_columns)
    return df_no_duplicate, len(df) - len(df_no_duplicate)


def to_json_allocataire_without_null(row) -> str:
    """Map a row's allocataire-* columns to the DB's allocataire JSON, dropping null values."""
    allocataire_mapping = {
        'qualite': row['allocataire-qualite'],
        'matricule': row['allocataire-matricule'],
        'code_organisme': row['allocataire-code_organisme'],
        'telephone': row['allocataire-telephone'],
        'nom': unaccent_and_upper(row['allocataire-nom']),
        'prenom': unaccent_and_upper(row['allocataire-prenom']),
        'courriel': row['allocataire-courriel']
    }
    filtered_NaN_allocataire = {k: v for k, v in allocataire_mapping.items() if pd.notnull(v)}
    return json.dumps(filtered_NaN_allocataire, ensure_ascii=False)


def add_allocataire_json_column(df: pd.DataFrame) -> pd.DataFrame:
    """Serialize the allocataire-* columns into the 'allocataire' JSON column."""
    df = df.copy()
    df['allocataire'] = df.apply(to_json_allocataire_without_null, axis=1)
    return df


def to_json_adresse_without_null(row) -> str:
    """Map a row's adresse_allocataire-* columns to the DB's adresse JSON, dropping null values."""
    adresse_mapping = {
        'voie': row['adresse_allocataire-voie'],
        'code_postal': format_insee_or_postal_code(row['adresse_allocataire-code_postal']),
        'commune': row['adresse_allocataire-commune'],
        'code_insee': format_insee_or_postal_code(row['adresse_allocataire-code_insee']),
        'cplt_adresse': row['adresse_allocataire-cplt_adresse'],
    }

    filtered_address = {k: v for k, v in adresse_mapping.items() if pd.notnull(v)}
    return json.dumps(filtered_address, ensure_ascii=False)


def add_adresse_allocataire_json_column(df: pd.DataFrame) -> pd.DataFrame:
    """Serialize the adresse_allocataire-* columns into the 'adresse_allocataire' JSON column."""
    df = df.copy()
    df['adresse_allocataire'] = df.apply(to_json_adresse_without_null, axis=1)
    return df


def drop_intermediate_columns(df: pd.DataFrame, columns: list = None) -> pd.DataFrame:
    """Drop the staging columns now folded into the JSON columns, plus the qf-batch pivot ones."""
    columns = FINAL_COLUMNS_TO_DROP if columns is None else columns
    return df.drop(columns=columns)


# --- Phase 2: post-checkpoint (qf-batch.ts has run) -------------------------------

def build_allocataire_key(df: pd.DataFrame) -> pd.Series:
    """Household key shared by the qf-batch output and the beneficiary rows."""
    return df['allocataire-code_organisme'] + '|' + df['allocataire-matricule']


def build_qf_value_lookup(df_qf_batch_output: pd.DataFrame) -> pd.Series:
    """Read qf-batch's verdict as a quotient value per household.

    qf-batch.ts records the raw quotient (qf_value), not an eligibility boolean: the
    threshold is applied by qf_eligible_index below. Unparseable values become NaN.
    """
    df_qf_batch_output = df_qf_batch_output.copy()
    df_qf_batch_output['allocataire_key'] = build_allocataire_key(df_qf_batch_output)
    return pd.to_numeric(df_qf_batch_output.set_index('allocataire_key')['qf_value'], errors='coerce')


def attach_qf_value(df: pd.DataFrame, qf_value_by_allocataire: pd.Series) -> pd.DataFrame:
    """Fan out one quotient_familial value per household to every child row of that allocataire.

    .map() (not merge) to preserve df's index, which the final rows are selected against.
    Rows without a value (404, error, non-ARS) stay NaN.
    """
    df = df.copy()
    df['qf_value'] = build_allocataire_key(df).map(qf_value_by_allocataire)
    return df


def _birthdate_within(df: pd.DataFrame, dob_min: datetime, dob_max: datetime) -> pd.Series:
    dob = pd.to_datetime(df['date_naissance']).dt.date
    return (dob >= dob_min.date()) & (dob <= dob_max.date())


def qf_eligible_index(
    df: pd.DataFrame,
    qf_max: int = QF_MAX,
    dob_min: datetime = QF_DOB_MIN,
    dob_max: datetime = QF_DOB_MAX,
) -> pd.Index:
    """Quotient familial route: 6-17 ans révolus, household quotient below the threshold.

    The window already trimmed the qf-batch input earlier; re-applied here per beneficiary
    because an eligible household can also hold out-of-window children. A NaN qf_value (no
    verdict from qf-batch: 404, error, non-ARS row) compares False.
    """
    return df.index[(df['qf_value'] < qf_max) & _birthdate_within(df, dob_min, dob_max)]


def aah_eligible_index(
    df: pd.DataFrame, dob_min: datetime = AAH_DOB_MIN, dob_max: datetime = AAH_DOB_MAX
) -> pd.Index:
    """AAH route: 16-30 ans révolus - situation already settled from CNAF's ORIGINESELECTION."""
    return df.index[(df['situation'] == 'AAH') & _birthdate_within(df, dob_min, dob_max)]


def aeeh_eligible_index(
    df: pd.DataFrame, dob_min: datetime = AEEH_DOB_MIN, dob_max: datetime = AEEH_DOB_MAX
) -> pd.Index:
    """AEEH route: 6-19 ans révolus - no quotient_familial call needed, CNAF already flags it."""
    return df.index[(df['situation'] == 'AEEH') & _birthdate_within(df, dob_min, dob_max)]


def select_eligible_by_index(df_final: pd.DataFrame, eligible_index: pd.Index) -> pd.DataFrame:
    """Keep the rows of df_final selected on the wider frame the routes are computed from.

    The route masks are built against the mapped frame, which alone carries qf_value and
    the pivot columns; df_final is the narrower, DB-shaped frame those rows are taken from.
    Selecting on index labels rather than passing the boolean mask across frames keeps this
    independent of the two frames having the exact same index lineage.
    """
    return df_final[df_final.index.isin(eligible_index)]
