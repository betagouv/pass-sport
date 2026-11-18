"""CPS (Caisse de Prévoyance Sociale de Saint-Pierre-et-Miquelon) processing for 2026.

The CPS is not one of the partners routed through qf-batch: it sends its own 20-column file,
already carrying the quotient familial of the households it selected. Its beneficiaries are
stored as MSA under code organisme 459, as in 2025 (see ../clean_miquelon.ipynb).

What is shared with the other partners - eligibility windows, JSON serialization, lamp01
deduplication key, casing - comes from ../partners_lib.py. What is left here is what only the
CPS file looks like: its column names, its free-form phone numbers, its foreign birthplaces
coded on 8 digits, and the rule deciding the situation, which the CPS does not flag itself.

Functions are pure: they take a DataFrame and return a new one (plus a count when the script
reports it), never touching the filesystem or os.environ. See test_clean_spm_lib.py.
"""

import json

import numpy as np
import pandas as pd

import partners_lib as partners
from utils.data_utils import pad_insee_or_postal_codes

# The 20 columns the CPS delivers in 2026, in order.
SPM_2026_HEADER = [
    'organisme', 'date_naissance', 'nom', 'nom_naissance', 'prenom', 'genre',
    'allocataire-qualite', 'allocataire-nom', 'allocataire-prenom', 'allocataire-telephone',
    'allocataire-courriel', 'allocataire-commune_naissance', 'allocataire-code_iso_pays_naissance',
    'adresse-allocataire_voie', 'adresse-allocataire_nom_adresse_postal',
    'adresse-allocataire_code_postal', 'adresse-allocataire_commune',
    'adresse-allocataire_code_insee', 'adresse-allocataire_cptl_adresse', 'quotient-familial',
]

CPS = 'CPS'
ORGANISME = 'MSA'
CODE_ORGANISME = '459'

SPM_COLUMN_MAPPING = {
    # the number and the street name, joined by build_voie: despite its name,
    # nom_adresse_postal holds the street, not the addressee
    'adresse-allocataire_voie': 'adresse_allocataire-numero_voie',
    'adresse-allocataire_nom_adresse_postal': 'adresse_allocataire-nom_voie',
    'adresse-allocataire_code_postal': 'adresse_allocataire-code_postal',
    'adresse-allocataire_commune': 'adresse_allocataire-commune',
    'adresse-allocataire_code_insee': 'adresse_allocataire-code_insee',
    'adresse-allocataire_cptl_adresse': 'adresse_allocataire-cplt_adresse',
    # an INSEE code (97502), or a foreign code on 8 digits (99155003), never a label
    'allocataire-commune_naissance': 'allocataire-code_insee_commune_naissance',
    'quotient-familial': 'qf_value',
}

# Without these no code can be drawn, nor the situation decided.
REQUIRED_COLUMNS = partners.NECESSARY_COLUMNS + ['allocataire-nom', 'allocataire-prenom']

GENRES = ('M', 'F')

# ISO codes of the territories whose communes carry an INSEE code: a birth there keeps it.
# Réunion (RE, 97410) is as French as Saint-Pierre (PM, 97502).
FRENCH_TERRITORY_ISO_CODES = ('FR', 'PM', 'RE', 'GP', 'MQ', 'GF', 'YT', 'BL', 'MF', 'WF', 'PF', 'NC')

INSEE_CODE_PATTERN = r'\d{5}|2[AB]\d{3}'

# Two numbers in one field: "06 39 98 81 09 / 06 39 98 22 09", "51 54 58 - 41 22 33". A dash
# with no space around it separates the digits of one number: "06-39-98-79-94".
PHONE_SEPARATOR = r'\s*/\s*|\s+-\s+'

ADDRESS_CODE_COLUMNS = ['adresse_allocataire-code_postal', 'adresse_allocataire-code_insee']

ALLOCATAIRE_JSON_EXTRA_FIELDS = {
    'code_insee_commune_naissance': 'allocataire-code_insee_commune_naissance',
    'code_iso_pays_naissance': 'allocataire-code_iso_pays_naissance',
}

IN_FILE_DEDUPLICATION_KEY_COLUMNS = [
    'nom', 'prenom', 'date_naissance', 'genre', 'allocataire-nom', 'allocataire-prenom',
]

SPM_OUTPUT_COLUMNS = [
    'nom', 'prenom', 'date_naissance', 'genre', 'organisme', 'situation', 'allocataire',
    'adresse_allocataire', 'created_at', 'updated_at', 'exercice_id', 'uuid_doc', 'zrr', 'qpv',
    'a_valider', 'refuser', 'id_psp',
]

# Input of `pnpm codes:partner-emails` (worker/src/scripts/send-partner-code-emails.ts).
EMAIL_COLUMNS = [
    'id', 'kind', 'code', 'email', 'nom', 'prenom', 'date_naissance', 'allocataire_nom',
    'allocataire_prenom',
]

# The beneficiary is the allocataire on the AAH route only: everywhere else a parent reads the
# code minted for their child - same split as codeEmailKindForAide in worker/src/email/notify.ts.
EMAIL_KIND_BY_SITUATION = {'AAH': 'code_direct_aah', 'jeune': 'code_indirect', 'AEEH': 'code_indirect'}


def _rows(mask: pd.Series) -> list:
    """File line numbers of the masked rows: header is line 1, so row 0 is line 2."""
    return [int(i) + 2 for i in mask[mask].index]


def read_raw_spm_csv(filepath) -> pd.DataFrame:
    """The CPS file: comma-separated, every field quoted, read as text."""
    df = pd.read_csv(filepath, sep=',', dtype=str, keep_default_na=False, encoding='utf-8')

    if list(df.columns) != SPM_2026_HEADER:
        missing = [column for column in SPM_2026_HEADER if column not in df.columns]
        unexpected = [column for column in df.columns if column not in SPM_2026_HEADER]
        raise ValueError(
            f"unexpected CPS header - missing: {missing}, unexpected: {unexpected}. "
            f"Got: {list(df.columns)}")
    return df


def map_spm_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename to the PSP schema and file the CPS rows as MSA, code organisme 459."""
    not_cps = df['organisme'] != CPS
    if not_cps.any():
        raise ValueError(
            f"organisme other than {CPS} on line(s) {_rows(not_cps)}: "
            f"{sorted(set(df.loc[not_cps, 'organisme']))}")

    df = df.rename(columns=SPM_COLUMN_MAPPING)
    df['organisme'] = ORGANISME
    df['allocataire-code_organisme'] = CODE_ORGANISME
    # The CPS sends no matricule; the shared serializer reads the column, and drops it once
    # blank_to_nan has made it null.
    df['allocataire-matricule'] = ''
    return df


def blank_to_nan(df: pd.DataFrame) -> pd.DataFrame:
    """Empty cells become NaN, which the JSON serializers drop rather than writing ""."""
    return df.where(df.ne(''))


def split_missing_required(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Rows lacking a required value are set aside, motif included, rather than dropped."""
    mask_missing = df[REQUIRED_COLUMNS].isna().any(axis=1)
    return df[~mask_missing], df[mask_missing].assign(motif='champ_obligatoire_vide')


def apply_nom_naissance(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """`nom` becomes the birth name when the CPS gives one, as the MSA stores it.

    The delivered `nom` is kept as `nom_usage`: the allocataire may be filed under either.
    Returns (df, how many rows got a birth name different from their delivered nom).
    """
    df = df.copy()
    df['nom_usage'] = df['nom']
    df['nom'] = df['nom_naissance'].fillna(df['nom'])
    changed = partners.normalise_recherche(df['nom']) != partners.normalise_recherche(df['nom_usage'])
    return df, int(changed.sum())


def check_genre(df: pd.DataFrame) -> None:
    """Beneficiary genre must already be M/F, once upper-cased."""
    invalid = ~df['genre'].isin(GENRES)
    if invalid.any():
        raise ValueError(
            f"genre other than {GENRES} on line(s) {_rows(invalid)}: {sorted(set(df.loc[invalid, 'genre']))}")


def normalize_phone(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """First number of the field, digits only, known placeholders dropped.

    The 6-digit SPM numbers (51 54 58) are kept as they are. Returns (df, how many fields held
    two numbers).
    """
    df = df.copy()
    phone = df['allocataire-telephone']
    parts = phone.str.split(PHONE_SEPARATOR, n=1, regex=True)
    df['allocataire-telephone'] = (
        parts.str[0].str.replace(r'\D', '', regex=True).replace('', np.nan))
    df = partners.clear_placeholder_phone_numbers(df)
    return df, int((parts.str.len() > 1).sum())


def build_voie(df: pd.DataFrame) -> pd.DataFrame:
    """Number + street name, empty parts skipped; neither of them leaves no voie at all."""
    df = df.copy()
    parts = df[['adresse_allocataire-numero_voie', 'adresse_allocataire-nom_voie']]
    df['adresse_allocataire-voie'] = parts.apply(
        lambda row: ' '.join(row.dropna()) or np.nan, axis=1, result_type='reduce')
    return df


def clean_birthplace(df: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    """Allocataire's INSEE birth code: missing leading zero restored, foreign ones cleared.

    The CPS codes a foreign birth on 8 digits (99155003 = Ukraine + a locality), which is not
    an INSEE commune code; the ISO country is what is kept for those. Any code left that is not
    a commune code raises, rather than reaching LCA.

    Returns (df, padded_count, cleared_count).
    """
    df = df.copy()
    column = 'allocataire-code_insee_commune_naissance'

    padded = pad_insee_or_postal_codes(df[column])
    padded_count = int((df[column].notna() & (padded != df[column])).sum())

    born_abroad = ~df['allocataire-code_iso_pays_naissance'].isin(FRENCH_TERRITORY_ISO_CODES)
    cleared_count = int((born_abroad & padded.notna()).sum())
    df[column] = padded.mask(born_abroad)

    malformed = df[column].notna() & ~df[column].astype(str).str.fullmatch(INSEE_CODE_PATTERN)
    if malformed.any():
        raise ValueError(
            f"birth INSEE code that is no commune code on line(s) {_rows(malformed)}: "
            f"{sorted(set(df.loc[malformed, column]))}")
    return df, padded_count, cleared_count


def pad_address_codes(df: pd.DataFrame) -> pd.DataFrame:
    """Same missing leading zero, on the household's postal and INSEE codes."""
    df = df.copy()
    for column in ADDRESS_CODE_COLUMNS:
        df[column] = pad_insee_or_postal_codes(df[column])
    return df


def parse_qf(df: pd.DataFrame) -> pd.DataFrame:
    """Quotient familial as a number; empty stays NaN, anything else unreadable raises."""
    df = df.copy()
    qf = pd.to_numeric(df['qf_value'], errors='coerce')
    unreadable = df['qf_value'].notna() & qf.isna()
    if unreadable.any():
        raise ValueError(
            f"unreadable quotient familial on line(s) {_rows(unreadable)}: "
            f"{sorted(set(df.loc[unreadable, 'qf_value']))}")
    df['qf_value'] = qf
    return df


def assign_situation(df: pd.DataFrame) -> pd.DataFrame:
    """The CPS flags no situation, it is read off the row, in this order:

    1. the beneficiary is the allocataire (same prénom, nom equal to the delivered or the birth
       name) -> AAH;
    2. otherwise a quotient familial is given -> jeune (QF route);
    3. otherwise -> AEEH.
    """
    df = df.copy()
    alloc_nom = partners.normalise_recherche(df['allocataire-nom'])
    same_nom = (
        (alloc_nom == partners.normalise_recherche(df['nom']))
        | (alloc_nom == partners.normalise_recherche(df['nom_usage'])))
    same_prenom = (
        partners.normalise_recherche(df['allocataire-prenom']) == partners.normalise_recherche(df['prenom']))

    df['situation'] = np.select(
        [same_nom & same_prenom, df['qf_value'].notna()], ['AAH', 'jeune'], default='AEEH')
    return df


def select_eligible(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Each situation's eligibility window, plus QF < 700 on the QF route.

    Returns (eligible, rejected), rejected carrying the `motif` of each row.
    """
    eligible_index = (
        partners.aah_eligible_index(df)
        .union(partners.qf_eligible_index(df))
        .union(partners.aeeh_eligible_index(df)))
    mask_eligible = df.index.isin(eligible_index)

    rejected = df[~mask_eligible].copy()
    rejected['motif'] = np.select(
        [
            rejected['situation'] == 'AAH',
            (rejected['situation'] == 'jeune') & (rejected['qf_value'] >= partners.QF_MAX),
            rejected['situation'] == 'jeune',
        ],
        ['hors_fenetre_aah', 'qf_trop_eleve', 'hors_fenetre_qf'],
        default='hors_fenetre_aeeh')
    return df[mask_eligible], rejected


def drop_in_file_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """The same beneficiary of the same allocataire delivered twice keeps one row."""
    return partners.drop_duplicate_beneficiaries(df, IN_FILE_DEDUPLICATION_KEY_COLUMNS)


def split_already_in_lamp(df: pd.DataFrame, df_lamp: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """partners.drop_beneficiaries_already_in_lamp, the known rows carrying lamp01's code.

    df carries the `allocataire` JSON column, df_lamp a public.beneficiaires export with
    id_psp. Returns (df_new, df_known), df_known with `id_psp_existant`.
    """
    # build_lamp_deduplication_key needs at least one row to return a Series.
    if df.empty or df_lamp.empty:
        return df, df.iloc[0:0].assign(id_psp_existant=pd.Series(dtype=str))

    df_new, df_known = partners.drop_beneficiaries_already_in_lamp(df, df_lamp)
    if df_known.empty:
        return df_new, df_known.assign(id_psp_existant=pd.Series(dtype=str))

    code_by_key = (
        df_lamp.assign(key=partners.build_lamp_deduplication_key(df_lamp))
        .drop_duplicates('key').set_index('key')['id_psp'])
    known_keys = partners.build_lamp_deduplication_key(partners.flatten_allocataire_identity(df_known))
    return df_new, df_known.assign(id_psp_existant=known_keys.map(code_by_key))


def select_output_columns(df: pd.DataFrame) -> pd.DataFrame:
    """The production columns, in the order both injectors read them."""
    return df[SPM_OUTPUT_COLUMNS]


def build_email_rows(df_coded: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """One mail per coded beneficiary, sent to the allocataire's courriel.

    Returns (df_emails, how many coded beneficiaries have no courriel to send to).
    """
    allocataire = df_coded['allocataire'].map(json.loads)
    emails = pd.DataFrame({
        'id': df_coded['id_psp'],
        'kind': df_coded['situation'].map(EMAIL_KIND_BY_SITUATION),
        'code': df_coded['id_psp'],
        'email': allocataire.map(lambda a: a.get('courriel')),
        'nom': df_coded['nom'],
        'prenom': df_coded['prenom'],
        'date_naissance': df_coded['date_naissance'].astype(str).str[:10],
        'allocataire_nom': allocataire.map(lambda a: a.get('nom')),
        'allocataire_prenom': allocataire.map(lambda a: a.get('prenom')),
    }, index=df_coded.index)

    assert emails['kind'].notna().all(), set(df_coded['situation'])
    mask_no_email = emails['email'].isna()
    return emails[~mask_no_email][EMAIL_COLUMNS], int(mask_no_email.sum())
