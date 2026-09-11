"""Keying the coded CNAF rows back onto every column clean_cnaf_1 dropped.

`DB_CNAF_EXPORT_2026` only carries the 8 site-facing columns, so the dated
`*-cnaf*-with-codes.csv` that `generate_new_codes.ipynb` writes has an `id_psp` but no
matricule, no address, no ORIGINESELECTION. This module puts them back: phase 1 is replayed
from the raw CNAF file without any of its column drops, and the resulting frame is merged
onto the coded rows. The output is shaped for lamp01/inject_csv.sh: the beneficiaires
columns, then the recovered fields bound for beneficiaire_cnaf_extra_field.

Used by reconcile_cnaf_raw_with_codes.ipynb. Functions are pure, like the rest of the
partner libs: they take a DataFrame and return a new one, never touching the filesystem.

See test_reconcile_cnaf_lib.py for the unit tests.
"""

import pandas as pd

import partners_lib as partners

# What a coded row and a phase-1 row still have in common once the export has dropped
# everything else. It is exactly partners.DEDUPLICATION_KEY_COLUMNS with the allocataire-*
# half folded into its JSON column, so two rows sharing this key are the same beneficiary.
MERGE_KEY_COLUMNS = [
    'date_naissance',
    'nom',
    'prenom',
    'genre',
    'organisme',
    'situation',
    'allocataire',
    'adresse_allocataire',
]

# The beneficiaires columns of the codes files the output leaves out:
# - uuid_doc/zrr/qpv/a_valider/refuser are generate_codes_lib.add_production_default_columns'
#   placeholders (a doc id and moderation flags), meaningless before a code is ever validated
# - fichier_codes is this notebook's own bookkeeping, not part of any beneficiary's data
RECONCILED_COLUMNS_TO_DROP = ['uuid_doc', 'zrr', 'qpv', 'a_valider', 'refuser', 'fichier_codes']

# What the replay recovered on top of the allocataire JSON's shared core, renamed to the
# columns of lamp01's beneficiaire_cnaf_extra_field table - lamp01/inject_csv.sh routes
# every CSV column that is not a beneficiaires one to that table, under the same name. The
# cnaf_ prefix keeps them apart from the beneficiaires columns inject_csv.sh flattens the
# allocataire JSON into (allocataire_date_naissance...), which would otherwise claim them. The
# core itself (qualite, matricule, telephone, adresse...) is left to the JSON columns rather
# than repeated here - allocataire-nom_usage included, since CNAF defaults it to the same
# RESPDOS value already serialized as the JSON's "nom" key. Values keep the shape
# prepare_qf_identity_columns gave them: ISO date, COG code, genre as 'male'/'female'.
EXTRA_FIELD_COLUMNS = {
    'allocataire-nom_naissance': 'cnaf_allocataire_nom_naissance',
    'allocataire-date_naissance': 'cnaf_allocataire_date_naissance',
    'allocataire-genre': 'cnaf_allocataire_genre',
    'allocataire-code_insee_naissance': 'cnaf_allocataire_code_insee_naissance',
    'allocataire-pays_naissance': 'cnaf_allocataire_pays_naissance',
    'allocataire-code_pays_naissance': 'cnaf_allocataire_code_pays_naissance',
}


def prepare_qf_identity_columns(
    df: pd.DataFrame, cog_by_country_label: pd.Series
) -> tuple[pd.DataFrame, list, int]:
    """Shape the allocataire-* pivot columns the same way the qf-batch input does, on every row.

    clean_cnaf_1_before_qf_batch.ipynb only does this for the ARS-origin allocataires the
    qf-batch input needs (partners.select_qf_route_allocataires). This notebook carries every
    beneficiary, ARS or not, so the same shaping is applied broadly: a row CNAF never sent
    this pivot identity for (AAH/AEEH - see the CNAF_COLUMN_MAPPING comment in clean_cnaf_lib)
    simply keeps blank pivot columns, exactly like the qf-batch input would.

    Returns (df, unmapped_labels, born_abroad_count) - see partners.map_birth_country_to_cog
    and partners.clear_foreign_birthplace_insee.
    """
    df = partners.format_qf_identity_fields(df)
    df, unmapped_labels = partners.map_birth_country_to_cog(df, cog_by_country_label)
    df, born_abroad_count = partners.clear_foreign_birthplace_insee(df)
    return df, unmapped_labels, born_abroad_count


def filter_rows_missing_required_fields(df: pd.DataFrame) -> pd.DataFrame:
    """Phase 1's row filter, without the all-null column drop that comes bundled with it.

    partners.filter_rows_missing_required_fields also drops every column left entirely
    null, which is precisely what this notebook must not do.
    """
    return df.dropna(subset=partners.NECESSARY_COLUMNS)


def format_date_naissance_as_exported(df: pd.DataFrame) -> pd.DataFrame:
    """Render date_naissance the way the export wrote it, so it can be merged on.

    Phase 2 casts the datetime to string right before to_csv and the codes file is read
    back as text, leaving 'YYYY-MM-DD HH:MM:SS' on both sides of the merge.
    """
    df = df.copy()
    df['date_naissance'] = df['date_naissance'].astype(str)
    return df


def drop_merge_key_collisions(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Keep one row per merge key, so no coded row can be fanned out into several.

    The frame is already deduplicated on partners.DEDUPLICATION_KEY_COLUMNS, which is
    finer: a collision left here is two beneficiaries whose allocataire names differ only
    by an accent, folded away by unaccent_and_upper when the JSON column was built. Their
    remaining columns are identical apart from that accent.

    Returns (df, collision_count).
    """
    df_unique = df.drop_duplicates(subset=MERGE_KEY_COLUMNS)
    return df_unique, len(df) - len(df_unique)


def merge_codes_with_full_rows(
    df_codes: pd.DataFrame, df_full: pd.DataFrame
) -> tuple[pd.DataFrame, pd.Index]:
    """Attach every phase-1 column to the coded rows, keyed on what the export kept.

    One row out per coded row: the merge is many-to-one, validated as such, so it can
    neither add nor lose a code.

    Returns (df_reconciled, unmatched_index) - a coded row without a match means the raw
    CNAF file replayed here is not the one those codes were generated from.
    """
    df_reconciled = df_codes.merge(
        df_full, on=MERGE_KEY_COLUMNS, how='left', validate='m:1', indicator='_matched')

    unmatched_index = df_reconciled.index[df_reconciled['_matched'] != 'both']
    return df_reconciled.drop(columns='_matched'), unmatched_index


def select_rows_without_code(df_full: pd.DataFrame, df_codes: pd.DataFrame) -> pd.DataFrame:
    """The phase-1 rows no code was ever handed to, for reporting the other side of the merge.

    Expected to be non-empty: a beneficiary outside their route's eligibility window, or
    in a household qf-batch put above the quotient threshold, reaches phase 1 and stops there.
    """
    coded_keys = pd.MultiIndex.from_frame(df_codes[MERGE_KEY_COLUMNS])
    full_keys = pd.MultiIndex.from_frame(df_full[MERGE_KEY_COLUMNS])
    return df_full[~full_keys.isin(coded_keys)]


def select_output_columns(df_reconciled: pd.DataFrame, df_codes: pd.DataFrame) -> pd.DataFrame:
    """One row per code: the beneficiaires columns, then the recovered extra fields.

    The beneficiaires half is the codes files' own columns - allocataire and
    adresse_allocataire JSON included, exactly as the export wrote them - minus
    RECONCILED_COLUMNS_TO_DROP. The extra half is EXTRA_FIELD_COLUMNS, under its table
    names. Every raw or staging column the replay carried is left out.
    """
    table_columns = [column for column in df_codes.columns
                     if column not in RECONCILED_COLUMNS_TO_DROP]
    return (df_reconciled[table_columns + list(EXTRA_FIELD_COLUMNS)]
            .rename(columns=EXTRA_FIELD_COLUMNS))
