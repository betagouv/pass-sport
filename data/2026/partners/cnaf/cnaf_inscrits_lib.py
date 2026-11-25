"""Matching the 2026 inscrits back onto the raw CNAF files, for the CNAF feedback export.

The CNAF wants the beneficiaries who activated their pass (inscription in state 1-4) with its
own values, not ours. extraction_inscrits.sql gives one row per inscription off the production
LCA database. Each CAF row is found again in the two raw CNAF files:
- the file clean_cnaf_1_before_qf_batch.ipynb reads (cnaf.CNAF_RAW_COLUMNS)
- the 2026-10-06 AEEH file 10_06_2026_clean_cnaf_aeeh.ipynb reads (cnaf.CNAF_RAW_COLUMNS_10_06_2026)

The key is the allocataire matricule plus the child's nom, prenom and birthdate. The matricule
alone names the household, so it would also export the siblings who never activated. CODORG is
not part of the key because the extract does not carry it.

Used by 25_11_2026_export_cnaf_inscrits.py. Functions are pure, like the rest of the partner
libs. See test_cnaf_inscrits_lib.py.
"""

import pandas as pd

import clean_cnaf_lib as cnaf
from utils.data_utils import unaccent_and_upper

INSCRITS_ORGANISME = 'CAF'

# The raw columns carried through the match, under the first file's names.
RAW_COLUMNS = [
    'CODORG', 'MATRICULE', 'RESPDOS', 'NOMNAIDOS', 'PRENOMDOS', 'DTNAIDOS', 'SEXDOS',
    'NOMENF', 'PRENOMENF', 'DTNAIENF', 'SEXENF', 'ORIGINESELECTION',
]

# The 2026-10-06 file spells the household and child columns its own way.
AEEH_EXPORT_TO_CNAF_COLUMNS = {
    'numorg': 'CODORG',
    'matricul': 'MATRICULE',
    'nomenf': 'NOMENF',
    'prenomen': 'PRENOMENF',
    'dtnaienf': 'DTNAIENF',
    'sexeenf': 'SEXENF',
}

OUTPUT_COLUMNS = [
    'CODORG', 'MATRICULE', 'RESPDOS', 'NOMNAIDOS', 'PRENOMDOS', 'DTNAIDOS', 'SEXDOS',
    'NOM_BENEF', 'PRENOMENF', 'DTNAIENF', 'SEXENF',
]

KEY_COLUMNS = ['cle_matricule', 'cle_nom', 'cle_prenom', 'cle_date_naissance']

UNMATCHED_COLUMNS = ['inscription_id', 'beneficiaire_id', 'id_psp', 'situation']


def _identity_key(matricule: pd.Series, nom: pd.Series, prenom: pd.Series,
                  date_naissance_iso: pd.Series) -> dict:
    """The match key, normalised the way the pipeline normalised nom/prenom before injection."""
    return {
        'cle_matricule': matricule.str.strip(),
        'cle_nom': nom.str.strip().map(unaccent_and_upper),
        'cle_prenom': prenom.str.strip().map(unaccent_and_upper),
        'cle_date_naissance': date_naissance_iso,
    }


def align_aeeh_export(df: pd.DataFrame) -> pd.DataFrame:
    """Give the 2026-10-06 file the first file's column names. Every row in it is AEEH."""
    return (df.rename(columns=AEEH_EXPORT_TO_CNAF_COLUMNS)
              .assign(ORIGINESELECTION='AEEH')[RAW_COLUMNS])


def build_raw_candidates(df_first: pd.DataFrame, df_aeeh: pd.DataFrame) -> pd.DataFrame:
    """Both raw files in one frame: keyed, tagged with their file (1, 2) and their situation.

    Rows without a matricule or with an unparsable child birthdate are dropped, since they
    cannot match. Exact duplicates are dropped too, and the first file's copy is the one kept.
    """
    df = pd.concat([
        df_first[RAW_COLUMNS].assign(fichier=1),
        align_aeeh_export(df_aeeh).assign(fichier=2),
    ], ignore_index=True)
    df[RAW_COLUMNS] = df[RAW_COLUMNS].fillna('')

    date_naissance_iso = pd.to_datetime(
        df['DTNAIENF'], format='%d/%m/%Y', errors='coerce').dt.strftime('%Y-%m-%d')
    df = df.assign(
        **_identity_key(df['MATRICULE'], df['NOMENF'], df['PRENOMENF'], date_naissance_iso),
        situation_cnaf=df['ORIGINESELECTION'].map(cnaf.SITUATION_BY_ORIGIN),
    )

    df = df[(df['cle_matricule'] != '') & df['cle_date_naissance'].notna()]
    return df.drop_duplicates(subset=RAW_COLUMNS).reset_index(drop=True)


def select_cnaf_inscrits(df_inscrits: pd.DataFrame) -> pd.DataFrame:
    """CAF beneficiaries who have a matricule, one row per beneficiary."""
    mask = ((df_inscrits['organisme'].str.strip().str.upper() == INSCRITS_ORGANISME)
            & (df_inscrits['allocataire_matricule'].str.strip() != ''))
    return df_inscrits[mask].drop_duplicates(subset='beneficiaire_id').reset_index(drop=True)


def match_inscrits(
    df_inscrits: pd.DataFrame, df_raw: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, int]:
    """One raw CNAF row per inscrit, found on KEY_COLUMNS.

    A child can match several raw rows, for example when it appears in both files. The row whose
    situation matches the database's wins, and the first file breaks a tie.

    Returns (df_matched, df_unmatched, several_candidates_count). df_unmatched only holds
    UNMATCHED_COLUMNS: it is a control file, not an export.
    """
    df_keyed = df_inscrits.assign(**_identity_key(
        df_inscrits['allocataire_matricule'], df_inscrits['nom'], df_inscrits['prenom'],
        df_inscrits['date_naissance'].str.strip()))

    df_candidates = df_keyed[['beneficiaire_id', 'situation', *KEY_COLUMNS]].merge(
        df_raw, on=KEY_COLUMNS, how='inner')
    df_candidates['meme_situation'] = df_candidates['situation'] == df_candidates['situation_cnaf']

    several_candidates_count = int((df_candidates['beneficiaire_id'].value_counts() > 1).sum())

    df_matched = (df_candidates
                  .sort_values(['beneficiaire_id', 'meme_situation', 'fichier'],
                               ascending=[True, False, True], kind='stable')
                  .drop_duplicates(subset='beneficiaire_id')
                  .reset_index(drop=True))

    df_unmatched = df_keyed.loc[
        ~df_keyed['beneficiaire_id'].isin(df_matched['beneficiaire_id']), UNMATCHED_COLUMNS
    ].reset_index(drop=True)

    return df_matched, df_unmatched, several_candidates_count


def format_output(df_matched: pd.DataFrame) -> pd.DataFrame:
    """OUTPUT_COLUMNS, with no duplicate rows, sorted by caisse.

    CODORG is sorted as a number, so '21' comes before '143'.
    """
    df = df_matched.rename(columns={'NOMENF': 'NOM_BENEF'})[OUTPUT_COLUMNS].drop_duplicates()
    return (df.assign(_codorg=pd.to_numeric(df['CODORG'], errors='coerce'))
              .sort_values(['_codorg', 'CODORG', 'MATRICULE', 'NOM_BENEF', 'PRENOMENF'],
                           kind='stable')
              .drop(columns='_codorg')
              .reset_index(drop=True))
