"""Unit tests for reconcile_cnaf_lib, the merge behind reconcile_cnaf_raw_with_codes.ipynb.

The last test is the one that matters: it runs the real phase-1 / phase-2 / code-generation
chain on a tiny CNAF file, then replays phase 1 the way the reconciliation notebook does and
merges the two, asserting every code found its raw row again. That is what proves the merge
key still lines up should any of those steps change.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnaf/test_reconcile_cnaf_lib.py
"""

import csv

import numpy as np
import pandas as pd

import generate_codes_lib
import partners_lib as partners
import clean_cnaf_lib as cnaf
import reconcile_cnaf_lib as lib


def _full_row(**overrides):
    values = {
        'date_naissance': '2015-06-12 04:00:00',
        'nom': 'DUPONT',
        'prenom': 'LEA',
        'genre': 'F',
        'organisme': 'CAF',
        'situation': 'AEEH',
        'allocataire': '{"matricule": "123"}',
        'adresse_allocataire': '{"commune": "CAEN"}',
        'allocataire-matricule': '123',
        'NOMCOMPLET': 'MME DUPONT LEA',
    }
    values.update(overrides)
    return values


def _full_frame(*rows):
    return pd.DataFrame([_full_row(**row) for row in rows])


def _codes_frame(*rows):
    frame = pd.DataFrame([_full_row(**row) for row in rows])
    frame['id_psp'] = [f"26-AAAA-{index:04d}" for index in range(len(frame))]
    return frame[lib.MERGE_KEY_COLUMNS + ['id_psp']]


def test_merge_key_columns_are_the_deduplication_key_minus_its_allocataire_half():
    # The export folds the allocataire-* columns into two JSON columns and drops the
    # originals, so the key can only be the rest of the deduplication key plus that JSON.
    assert set(lib.MERGE_KEY_COLUMNS) == (
        set(partners.DEDUPLICATION_KEY_COLUMNS)
        - set(partners.FINAL_COLUMNS_TO_DROP)
    ) | {'allocataire', 'adresse_allocataire'}


def _cog_lookup():
    return partners.build_country_cog_lookup(pd.DataFrame({
        'COG': ['99100', '99350'],
        'LIBCOG': ['France', 'Maroc'],
        'LIBENR': ['République française', 'Royaume du Maroc'],
    }))


def test_prepare_qf_identity_columns_shapes_an_ars_row_like_the_qf_batch_input():
    df = pd.DataFrame({
        'allocataire-nom': ['DUPONT'],
        'allocataire-genre': ['F'],
        'allocataire-date_naissance': ['09/02/1980'],
        'allocataire-pays_naissance': ['FRANCE'],
        'allocataire-code_insee_naissance': ['75056'],
    })

    result, unmapped_labels, born_abroad_count = lib.prepare_qf_identity_columns(df, _cog_lookup())

    assert result['allocataire-nom_usage'].tolist() == ['DUPONT']
    assert result['allocataire-genre'].tolist() == ['female']
    assert result['allocataire-date_naissance'].tolist() == ['1980-02-09']
    assert result['allocataire-code_pays_naissance'].tolist() == ['99100']
    assert result['allocataire-code_insee_naissance'].tolist() == ['75056']
    assert unmapped_labels == []
    assert born_abroad_count == 0


def test_prepare_qf_identity_columns_leaves_a_row_cnaf_never_sent_the_pivot_for_blank():
    # AAH/AEEH rows: CNAF leaves these columns empty in the raw file itself (see the
    # CNAF_COLUMN_MAPPING comment in clean_cnaf_lib) - nothing here can recover data the
    # source file never carried, so the shaped columns stay null, same as an ARS row would
    # if qf-batch.ts had never been able to parse its birthdate.
    df = pd.DataFrame({
        'allocataire-nom': ['DUBOIS'],
        'allocataire-genre': [''],
        'allocataire-date_naissance': [''],
        'allocataire-pays_naissance': [''],
        'allocataire-code_insee_naissance': [''],
    })

    result, unmapped_labels, born_abroad_count = lib.prepare_qf_identity_columns(df, _cog_lookup())

    assert pd.isna(result['allocataire-genre'].iloc[0])
    assert pd.isna(result['allocataire-date_naissance'].iloc[0])
    assert pd.isna(result['allocataire-code_pays_naissance'].iloc[0])
    assert unmapped_labels == []


def test_filter_rows_missing_required_fields_drops_the_rows_but_keeps_empty_columns():
    df = _full_frame({}, {'nom': np.nan})
    df['ADRLIG6DESTDOS'] = np.nan

    result = lib.filter_rows_missing_required_fields(df)

    assert len(result) == 1
    assert 'ADRLIG6DESTDOS' in result.columns


def test_format_date_naissance_as_exported_renders_the_datetime_as_the_csv_holds_it():
    df = _full_frame({'date_naissance': pd.Timestamp('2015-06-12 04:00:00')})

    result = lib.format_date_naissance_as_exported(df)

    assert result['date_naissance'].tolist() == ['2015-06-12 04:00:00']


def test_drop_merge_key_collisions_keeps_one_row_per_key():
    df = _full_frame({'NOMCOMPLET': 'MME DUPONT LEA'}, {'NOMCOMPLET': 'MME DUPONT LEA BIS'})

    result, collision_count = lib.drop_merge_key_collisions(df)

    assert collision_count == 1
    assert result['NOMCOMPLET'].tolist() == ['MME DUPONT LEA']


def test_merge_codes_with_full_rows_gives_every_code_back_its_dropped_columns():
    df_codes = _codes_frame({}, {'prenom': 'HUGO', 'genre': 'M'})
    df_full = _full_frame({'NOMCOMPLET': 'MME DUPONT LEA'},
                          {'prenom': 'HUGO', 'genre': 'M', 'NOMCOMPLET': 'M DUPONT HUGO'})

    df_reconciled, unmatched_index = lib.merge_codes_with_full_rows(df_codes, df_full)

    assert len(unmatched_index) == 0
    assert len(df_reconciled) == len(df_codes)
    assert df_reconciled['NOMCOMPLET'].tolist() == ['MME DUPONT LEA', 'M DUPONT HUGO']
    assert df_reconciled['allocataire-matricule'].tolist() == ['123', '123']


def test_merge_codes_with_full_rows_reports_a_code_absent_from_the_raw_file():
    df_codes = _codes_frame({}, {'prenom': 'HUGO', 'genre': 'M'})
    df_full = _full_frame({})

    df_reconciled, unmatched_index = lib.merge_codes_with_full_rows(df_codes, df_full)

    assert len(df_reconciled) == 2
    assert df_reconciled.loc[unmatched_index, 'prenom'].tolist() == ['HUGO']
    assert df_reconciled['id_psp'].notna().all()


def test_merge_codes_with_full_rows_never_fans_a_code_out_over_several_rows():
    df_codes = _codes_frame({})
    df_full = _full_frame({'NOMCOMPLET': 'A'}, {'NOMCOMPLET': 'B'})

    try:
        lib.merge_codes_with_full_rows(df_codes, df_full)
    except pd.errors.MergeError:
        return
    raise AssertionError("a duplicated merge key must be rejected, not silently duplicated")


def test_select_rows_without_code_returns_the_beneficiaries_no_route_selected():
    df_codes = _codes_frame({})
    df_full = _full_frame({}, {'prenom': 'HUGO', 'genre': 'M'})

    result = lib.select_rows_without_code(df_full, df_codes)

    assert result['prenom'].tolist() == ['HUGO']


# --- End to end: the real chain, then the notebook's replay of it ------------------

CNAF_CSV_ROWS = [
    # AEEH route, so the fixture needs no qf-batch verdict to reach the export. NOMNAIDOS is
    # set (CNAF fills it for every route) but DTNAIDOS/SEXDOS/COMMUNENAIDOS/PAYSNAIDOS are
    # not (CNAF only fills those for ARS), matching CDBSP1O1N.csv's real AEEH/AAH rows.
    {'CODORG': '014', 'MATRICULE': '0000123', 'QUALDOS': 'MME', 'RESPDOS': 'DUPONT',
     'NOMNAIDOS': 'DUPONT', 'PRENOMDOS': 'MARIE', 'ADRMAIL': 'Marie.Dupont@Example.Fr',
     'NUMTEL': '612345678', 'NOMCOMPLET': 'MME  DUPONT   MARIE',
     'ADRLIG1DESTDOS': 'CHEZ M MARTIN', 'ADRLIG3DESTDOS': '12 RUE', 'ADRLIG4DESTDOS': 'DES LILAS',
     'ADRLIG5DESTDOS': '14000 CAEN', 'NUMINSEE': '14118',
     'NOMENF': 'DUPONT', 'PRENOMENF': 'LEA', 'DTNAIENF': '12/06/2015', 'SEXENF': 'F',
     'ORIGINESELECTION': 'AEEH'},
    {'CODORG': '014', 'MATRICULE': '0000123', 'QUALDOS': 'MME', 'RESPDOS': 'DUPONT',
     'NOMNAIDOS': 'DUPONT', 'PRENOMDOS': 'MARIE', 'ADRMAIL': 'Marie.Dupont@Example.Fr',
     'NUMTEL': '612345678', 'NOMCOMPLET': 'MME  DUPONT   MARIE',
     'ADRLIG1DESTDOS': 'CHEZ M MARTIN', 'ADRLIG3DESTDOS': '12 RUE', 'ADRLIG4DESTDOS': 'DES LILAS',
     'ADRLIG5DESTDOS': '14000 CAEN', 'NUMINSEE': '14118',
     'NOMENF': 'DUPONT', 'PRENOMENF': 'HUGO', 'DTNAIENF': '03/02/2012', 'SEXENF': 'M',
     'ORIGINESELECTION': 'AEEH'},
]


def _write_raw_cnaf_csv(path):
    header = ';'.join(cnaf.CNAF_RAW_COLUMNS)
    rows = []
    for overrides in CNAF_CSV_ROWS:
        values = {column: '' for column in cnaf.CNAF_RAW_COLUMNS} | overrides
        rows.append(';'.join(values[column] for column in cnaf.CNAF_RAW_COLUMNS))

    trailing_garbage = ';'.join([''] * len(cnaf.CNAF_RAW_COLUMNS))
    path.write_text(
        "PASSPORT;143;20260906;160036;;;;;;;;;;;;;;;;;;;;;\r\n"
        + f"{header}\r\n"
        + ''.join(f"{row}\r\n" for row in rows)
        + f"{trailing_garbage}\r\n",
        newline='',
    )


def _run_phase_1(filepath, filter_rows_missing_required_fields, drop_raw_address_columns,
                 prepare_qf_identity_columns=lambda df: df):
    """clean_cnaf_1_before_qf_batch.ipynb, minus the qf-batch input it writes.

    The steps the reconciliation notebook swaps out are injected, so the real chain and the
    notebook's replay of it differ here and nowhere else. prepare_qf_identity_columns
    defaults to a no-op: the real chain only shapes the ARS-only qf-batch input, off a frame
    this function never builds, so it has nothing to inject here.
    """
    df = cnaf.read_raw_cnaf_csv(str(filepath))
    df = cnaf.clean_raw_cnaf(df)
    df = cnaf.split_postal_code_and_commune(df)
    df = cnaf.normalize_full_name_spacing(df)
    df = cnaf.map_cnaf_columns(df)
    df = partners.clear_placeholder_phone_numbers(df)
    df = partners.normalize_allocataire_qualite(df)
    df = cnaf.build_allocataire_address_fields(df)
    df = cnaf.set_organisme_and_situation(df)
    df = partners.parse_beneficiary_birthdate(df)
    df = prepare_qf_identity_columns(df)
    df = drop_raw_address_columns(df)
    df = filter_rows_missing_required_fields(df)
    df = partners.normalize_identity_casing(df)
    df = partners.normalize_email_casing(df)
    df = partners.filter_within_eligibility_floor(df)
    df = partners.fix_phone_number_formatting(df)
    df = partners.clear_blank_email(df)
    df = partners.shift_birthdate_by_hours(df)
    df, _ = partners.drop_duplicate_beneficiaries(df)
    df = partners.add_allocataire_json_column(df)
    return partners.add_adresse_allocataire_json_column(df)


def _write_aeeh_export(df_phase_1, path):
    """clean_cnaf_2a_aah_aeeh.ipynb, for the AEEH route only."""
    df_final = partners.drop_intermediate_columns(df_phase_1)
    df_final = partners.select_eligible_by_index(
        df_final, partners.aeeh_eligible_index(df_final))
    df_final = df_final.copy()
    df_final['date_naissance'] = df_final['date_naissance'].astype(str)
    df_final.to_csv(path, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    return df_final


def test_the_codes_of_a_real_run_all_find_their_raw_row_again(tmp_path):
    raw_filepath = tmp_path / "cnaf.csv"
    _write_raw_cnaf_csv(raw_filepath)

    df_phase_1 = _run_phase_1(
        raw_filepath,
        filter_rows_missing_required_fields=partners.filter_rows_missing_required_fields,
        drop_raw_address_columns=cnaf.drop_raw_address_columns)
    df_export = _write_aeeh_export(df_phase_1, tmp_path / "cnaf_export.csv")
    assert len(df_export) == 2

    codes_filepath = tmp_path / "cnaf_aah_aeeh-with-codes.csv"
    generate_codes_lib.generate_codes_for_file(
        tmp_path / "cnaf_export.csv", codes_filepath, tmp_path / "existing_codes.csv")
    # The notebook tags each coded row with the file it came from (cell-24) before merging -
    # replayed here since RECONCILED_COLUMNS_TO_DROP expects that column to exist.
    df_codes = pd.read_csv(
        codes_filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False
    ).assign(fichier_codes=codes_filepath.name)

    cog_lookup = partners.build_country_cog_lookup(pd.DataFrame({
        'COG': ['99100'], 'LIBCOG': ['France'], 'LIBENR': ['République française']}))

    df_full = _run_phase_1(
        raw_filepath,
        filter_rows_missing_required_fields=lib.filter_rows_missing_required_fields,
        drop_raw_address_columns=lambda df: df,
        prepare_qf_identity_columns=lambda df: lib.prepare_qf_identity_columns(df, cog_lookup)[0])
    df_full = lib.format_date_naissance_as_exported(df_full)
    df_full, collision_count = lib.drop_merge_key_collisions(df_full)
    assert collision_count == 0

    df_reconciled, unmatched_index = lib.merge_codes_with_full_rows(df_codes, df_full)

    assert len(unmatched_index) == 0
    assert len(df_reconciled) == len(df_codes)
    assert df_reconciled['id_psp'].tolist() == df_codes['id_psp'].tolist()

    # Everything the export had dropped is back on the coded rows.
    assert df_reconciled['allocataire-matricule'].tolist() == ['0000123', '0000123']
    assert df_reconciled['situation_origine'].tolist() == ['AEEH', 'AEEH']
    assert df_reconciled['NOMCOMPLET'].tolist() == ['MME DUPONT MARIE', 'MME DUPONT MARIE']
    assert df_reconciled['ADRLIG1DESTDOS'].tolist() == ['CHEZ M MARTIN', 'CHEZ M MARTIN']
    assert df_reconciled['adresse_allocataire-code_insee'].tolist() == ['14118', '14118']

    # CNAF fills NOMNAIDOS for every route, so it survives even for this AEEH beneficiary...
    assert df_reconciled['allocataire-nom_naissance'].tolist() == ['DUPONT', 'DUPONT']
    # ...but DTNAIDOS/SEXDOS, ARS-only, stay blank - not a bug, see the notebook's ⚠️ note.
    assert df_reconciled['allocataire-date_naissance'].isna().all()
    assert df_reconciled['allocataire-genre'].isna().all()

    assert lib.select_rows_without_code(df_full, df_codes).empty

    # The notebook's last steps: flatten the JSON columns back into plain ones, then drop
    # whatever nothing downstream needs anymore.
    df_flat = partners.flatten_json_column(df_reconciled, 'allocataire', 'allocataire')
    df_flat = partners.flatten_json_column(df_flat, 'adresse_allocataire', 'adresse_allocataire')

    assert 'allocataire' not in df_flat.columns
    assert 'adresse_allocataire' not in df_flat.columns
    assert df_flat['allocataire-matricule'].tolist() == ['0000123', '0000123']
    assert df_flat['adresse_allocataire-commune'].tolist() == ['CAEN', 'CAEN']

    df_final = partners.drop_intermediate_columns(df_flat, lib.RECONCILED_COLUMNS_TO_DROP)

    assert not set(lib.RECONCILED_COLUMNS_TO_DROP) & set(df_final.columns)
    # Everything else - including what this run started out asking for - is still there.
    assert df_final['allocataire-nom_naissance'].tolist() == ['DUPONT', 'DUPONT']
    assert df_final['allocataire-matricule'].tolist() == ['0000123', '0000123']
    assert df_final['adresse_allocataire-commune'].tolist() == ['CAEN', 'CAEN']
