"""MSA-specific DataFrame processing for the clean_msa notebooks.

Everything the MSA shares with the CNAF lives one folder up, in partners_lib.py:
eligibility windows, deduplication, JSON serialization, route selection. What is left
here is what only the MSA file looks like - its 2026 column names, its %Y%m%d dates, its
1/2 genre codes, its street address split across four columns, and the leading zeros its
export drops from INSEE codes.

MSA started routing through qf-batch in 2026: its file now carries the allocataire pivot
identity (nom de naissance, prénom usuel, date/commune/pays de naissance) that the
quotient_familial call needs, which the 2025 format did not have.

Extracted out of the notebooks so it can be unit tested (see test_clean_msa_lib.py).
They keep the I/O - env vars, CSV/parquet reads/writes, printed stats - and call these
functions in order.

Functions are pure: they take a DataFrame and return a new one, never mutating their
input and never touching the filesystem or os.environ.
"""

import numpy as np
import pandas as pd

import partners_lib as partners
from utils.data_utils import format_insee_or_postal_code

MSA_COLUMN_MAPPING = {
    # infos about allocataire
    'numero_allocataire': 'allocataire-matricule',
    'organisme': 'allocataire-code_organisme',
    'qualite_allocataire': 'allocataire-qualite',
    'nom_naissance_allocataire': 'allocataire-nom',
    'prenom_usuel_allocataire': 'allocataire-prenom',
    'adresse_de_messagerie': 'allocataire-courriel',
    'numero_tel_portable': 'allocataire-telephone',

    # allocataire pivot identity for the quotient_familial API call, new in the 2026 format
    'date_naissance_alloc': 'allocataire-date_naissance',
    'commune_naissance_alloc': 'allocataire-commune_naissance',
    'code_insee_commune_naiss_alloc': 'allocataire-code_insee_naissance',
    'pays_naissance_alloc': 'allocataire-pays_naissance',
    'code_iso_pays_naiss_alloc': 'allocataire-code_iso_pays_naissance',

    # adresse allocataire - the *_dest columns hold the household's postal address
    'complement_adresse_dest': 'adresse_allocataire-cplt_adresse',
    'code_postal_dest': 'adresse_allocataire-code_postal',
    'nom_commune_dest': 'adresse_allocataire-commune',
    'code_insee_commune_dest': 'adresse_allocataire-code_insee',

    # MSA's own AAH/ARS/AEH classification, the counterpart of CNAF's ORIGINESELECTION
    'prestation': 'situation_origine',

    # infos about beneficiary
    'nom_beneficiaire': 'nom',
    'prenom_beneficiaire': 'prenom',
    'genre_beneficiaire': 'genre',
    'date_naissance_beneficiaire': 'date_naissance',
}

ORGANISME = 'MSA'

# MSA spells the AEEH route "AEH"; the PSP situation is the same as CNAF's.
SITUATION_BY_ORIGIN = {'ARS': 'jeune', 'AAH': 'AAH', 'AEH': 'AEEH'}

# MSA has no genre column for the allocataire, only a civility.
QUALITE_TO_GENRE = {'MR': 'M', 'MME': 'F'}

# ISO codes standing for "born in France" in the MSA export: '0' is what it writes when
# the birth country label is left empty, which is the case for every French birth.
FRANCE_ISO_CODES = ('0', 'FR')
FRANCE_COUNTRY_LABEL = 'FRANCE'
FRANCE_ISO_CODE = 'FR'

# The street address arrives split across four columns, in this order.
VOIE_COLUMNS = ['numero_voie_dest', 'complement_numero_voie_dest', 'type_voie_dest', 'voie_dest']

# Who the mail is addressed to. Usually the allocataire under their married name, but on a
# file under legal guardianship it is the guardian body - see build_allocataire_nom_usage.
DESTINATAIRE_COLUMNS = ['qualite_destinataire', 'nom_destinataire', 'prenom_destinataire']

MSA_RAW_COLUMNS_TO_DROP = ['caisse'] + DESTINATAIRE_COLUMNS + VOIE_COLUMNS

# What MSA carries on top of partners.FINAL_COLUMNS_TO_DROP: the columns it folds into its
# JSON columns that the CNAF does not have.
MSA_EXTRA_COLUMNS_TO_DROP = [
    'allocataire-commune_naissance',
    'allocataire-code_iso_pays_naissance',
    'adresse_allocataire-nom_adresse_postale',
]

# MSA keeps the allocataire's birth details and the postal addressee in its JSON columns,
# which the CNAF 2026 export does not carry. Values are taken verbatim, so every column
# listed here must already have its final shape when the JSON columns are built.
ALLOCATAIRE_JSON_EXTRA_FIELDS = {
    'date_naissance': 'allocataire-date_naissance',
    'commune_naissance': 'allocataire-commune_naissance',
    'code_insee_commune_naissance': 'allocataire-code_insee_naissance',
    'pays_naissance': 'allocataire-pays_naissance',
    'code_iso_pays_naissance': 'allocataire-code_iso_pays_naissance',
}

ADRESSE_JSON_EXTRA_FIELDS = {'nom_adresse_postale': 'adresse_allocataire-nom_adresse_postale'}


def map_msa_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename the raw MSA columns to the PSP schema.

    'nom_naissance_allocataire' feeds both 'allocataire-nom' (site-facing) and
    'allocataire-nom_naissance' (the qf-batch pivot): unlike the CNAF, MSA has a single
    allocataire name column and it *is* the birth name. The usage name lives in the
    destinataire columns - see build_allocataire_nom_usage.
    """
    df = df.rename(columns=MSA_COLUMN_MAPPING)
    df['allocataire-nom_naissance'] = df['allocataire-nom']
    return df


def derive_allocataire_genre(df: pd.DataFrame) -> pd.DataFrame:
    """MSA has no genre column for the allocataire: read it off the civility.

    Must run before partners.normalize_allocataire_qualite, which folds MR/MME into M/Mme
    and would make 'M' ambiguous.
    """
    df = df.copy()
    df['allocataire-genre'] = df['allocataire-qualite'].map(QUALITE_TO_GENRE)
    return df


def normalize_beneficiary_genre(df: pd.DataFrame) -> pd.DataFrame:
    """Beneficiary genre: MSA codes it 1/2 where the PSP schema expects M/F."""
    df = df.copy()
    df['genre'] = df['genre'].replace({'1': 'M', '2': 'F'})
    return df


def normalize_allocataire_birthdate(df: pd.DataFrame) -> pd.DataFrame:
    """Allocataire birthdate: %Y%m%d -> %d/%m/%Y.

    Puts it on the same format as the CNAF, so partners.format_qf_identity_fields needs no
    parameter, and keeps the shape the MSA allocataire JSON has carried since 2025.
    Unparsable values become NaN rather than being passed through.
    """
    df = df.copy()
    df['allocataire-date_naissance'] = pd.to_datetime(
        df['allocataire-date_naissance'], format='%Y%m%d', errors='coerce').dt.strftime('%d/%m/%Y')
    return df


def fill_france_birth_country(df: pd.DataFrame) -> pd.DataFrame:
    """MSA leaves the birth country label empty for a birth in France, ISO code '0'.

    Without this the label maps to no COG code and partners.clear_foreign_birthplace_insee
    would wipe the birthplace of every French-born allocataire - that is, of nearly the
    whole file - leaving qf-batch without a usable pivot identity.

    A row with a real foreign ISO code keeps its label untouched.
    """
    df = df.copy()
    mask_france = df['allocataire-code_iso_pays_naissance'].isin(FRANCE_ISO_CODES)
    df.loc[mask_france, 'allocataire-pays_naissance'] = FRANCE_COUNTRY_LABEL
    df.loc[mask_france, 'allocataire-code_iso_pays_naissance'] = FRANCE_ISO_CODE
    return df


def pad_birthplace_insee(df: pd.DataFrame) -> pd.DataFrame:
    """Restore the leading zero the MSA export drops from INSEE codes (9122 -> 09122).

    .apply() rather than a direct call: format_insee_or_postal_code works on one value,
    and handed a Series it swallows the error and returns it unpadded.
    """
    df = df.copy()
    df['allocataire-code_insee_naissance'] = df['allocataire-code_insee_naissance'].apply(
        format_insee_or_postal_code)
    return df


def build_allocataire_address_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Allocataire's street address, joined from the four columns MSA splits it across.

    Empty parts are skipped so a missing numero or type de voie leaves no double space.
    'adresse_allocataire-cplt_adresse' needs nothing here: MSA delivers it as one column.
    """
    df = df.copy()
    voie = ''
    for column in VOIE_COLUMNS:
        voie = voie + np.where(df[column].str.len() > 0, df[column] + ' ', '')
    df['adresse_allocataire-voie'] = pd.Series(voie, index=df.index).str.strip()
    return df


def build_nom_adresse_postale(df: pd.DataFrame) -> pd.DataFrame:
    """Who the mail is addressed to: civility + name + first name of the destinataire.

    Repeated whitespace is collapsed so a blank civility (a file under guardianship) does
    not leave a leading space.
    """
    df = df.copy()
    df['adresse_allocataire-nom_adresse_postale'] = (
        df[DESTINATAIRE_COLUMNS].agg(' '.join, axis=1)
        .str.replace(r'\s+', ' ', regex=True).str.strip())
    return df


def build_allocataire_nom_usage(df: pd.DataFrame) -> pd.DataFrame:
    """The allocataire's usage name for the quotient_familial pivot identity.

    MSA holds it in 'nom_destinataire', which differs from the birth name for a married
    allocataire. But the destinataire is not always the allocataire: on a file under legal
    guardianship it is the guardian body (TUTELLE ORBISK / SERVICE MJPM), which would be a
    false identity to send to the API. Those rows are recognised by an empty
    'qualite_destinataire' and fall back to the birth name.

    Set before partners.format_qf_identity_fields, which leaves an existing nom_usage alone.
    """
    df = df.copy()
    mask_destinataire_is_allocataire = df['qualite_destinataire'].str.len() > 0
    df['allocataire-nom_usage'] = df['allocataire-nom_naissance'].mask(
        mask_destinataire_is_allocataire, df['nom_destinataire'])
    return df


def set_organisme_and_situation(df: pd.DataFrame) -> pd.DataFrame:
    """Organism & situation - MSA flags the category itself through its prestation column."""
    return partners.set_organisme_and_situation(df, ORGANISME, SITUATION_BY_ORIGIN)


def drop_raw_msa_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove the raw columns, now that they have been joined and mapped."""
    return df.drop(columns=MSA_RAW_COLUMNS_TO_DROP)
