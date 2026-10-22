"""Unit tests of aah_direct_pipeline, the Python steps of run_aah_direct.sh.

Run from data/ : source .venv/bin/activate && pytest 2026/support-pipeline/test_aah_direct_pipeline.py
"""

import csv
import json

import pandas as pd
import pytest

import aah_direct_pipeline as pipeline
import clean_fc_lib as fc
import fc_pipeline

HEADER = "genre;Prénom;Nom;Date de naissance;email;Critère d'éligibilité"

# The header production's /nfs/run injector expects, in this order.
PROD_HEADER = [
    'nom', 'prenom', 'date_naissance', 'genre', 'situation', 'organisme', 'allocataire',
    'adresse_allocataire', 'exercice_id', 'uuid_doc', 'zrr', 'qpv', 'a_valider', 'refuser',
    'created_at', 'updated_at', 'id_psp',
]


def write_input(tmp_path, *lines, header=HEADER, encoding='utf-8'):
    path = tmp_path / 'entree.csv'
    path.write_bytes(('\n'.join([header, *lines]) + '\n').encode(encoding))
    return path


def run_clean(tmp_path, input_path) -> tuple[dict, dict]:
    paths = {name: tmp_path / f'{name}.csv'
             for name in ('clean', 'match', 'cnaf', 'identities', 'rejects')}
    stats = pipeline.clean(input_path, paths['clean'], paths['match'], paths['cnaf'],
                           paths['identities'], paths['rejects'])
    return stats, paths


def read(path, **kwargs) -> pd.DataFrame:
    return pd.read_csv(path, sep=';', dtype=str, keep_default_na=False, **kwargs)


# --- read_support_csv -------------------------------------------------------------

def test_reads_spaces_around_separators_bom_and_blank_lines(tmp_path):
    path = write_input(tmp_path, 'M ; Tozal ; MERVIK ; 07/08/2006; tozal@example.org ; aah', ';;;;;',
                       header='﻿' + HEADER)
    df = pipeline.read_support_csv(path)
    assert df.to_dict('records') == [{
        'ligne': 2, 'genre': 'M', 'prenom': 'Tozal', 'nom': 'MERVIK',
        'date_naissance': '07/08/2006', 'email': 'tozal@example.org', 'critere': 'aah',
    }]


def test_reads_a_cp1252_export(tmp_path):
    path = write_input(tmp_path, 'F;Élyra;Quistane;01/02/2004;elyra@example.org;aah',
                       encoding='cp1252')
    assert pipeline.read_support_csv(path)['prenom'].tolist() == ['Élyra']


def test_reads_a_comma_separated_file_with_technical_header_names(tmp_path):
    path = write_input(tmp_path, 'M, Tozal , MERVIK ,07/08/2006,tozal@example.org,aah',
                       header='genre,prenom,nom,date_naissance,email,critere')
    df = pipeline.read_support_csv(path)
    assert df.to_dict('records') == [{
        'ligne': 2, 'genre': 'M', 'prenom': 'Tozal', 'nom': 'MERVIK',
        'date_naissance': '07/08/2006', 'email': 'tozal@example.org', 'critere': 'aah',
    }]


def test_refuses_a_file_missing_a_column(tmp_path):
    path = write_input(tmp_path, 'M;Tozal;MERVIK;07/08/2006;aah', header='genre;Prénom;Nom;Date de naissance;Critère')
    with pytest.raises(ValueError, match='email'):
        pipeline.read_support_csv(path)


# --- validate ---------------------------------------------------------------------

@pytest.mark.parametrize('line, motif', [
    ('X;Pim;Dorvat;07/08/2006;pim@example.org;aah', 'genre inconnu'),
    ('F;Pim;Dorvat;31/02/2006;pim@example.org;aah', 'date de naissance illisible'),
    ('F;Pim;Dorvat;2006-02-01;pim@example.org;aah', 'date de naissance illisible'),
    ('F;Pim;;01/02/2006;pim@example.org;aah', 'champ vide : nom'),
    ('F;Pim;Dorvat;01/02/2006;pim.example.org;aah', 'email invalide'),
    ('F;Pim;Dorvat;01/02/2006;pim@example.org;aeeh', "critère d'éligibilité"),
    ('F;Pim;Dorvat;31/12/1995;pim@example.org;aah', 'hors fenêtre AAH'),
    ('F;Pim;Dorvat;01/01/2011;pim@example.org;aah', 'hors fenêtre AAH'),
])
def test_rejects_with_a_reason(tmp_path, line, motif):
    valid, rejected = pipeline.validate(pipeline.read_support_csv(write_input(tmp_path, line)))
    assert valid.empty
    assert motif in rejected['motif'].iloc[0]


def test_accepts_the_aah_window_bounds_and_any_case(tmp_path):
    raw = pipeline.read_support_csv(write_input(
        tmp_path,
        'm;Pim;Dorvat;01/01/1996;pim@example.org;AAH',
        'f;Ola;Dorvat;31/12/2010;ola@example.org;Aah'))
    valid, rejected = pipeline.validate(raw)
    assert rejected.empty
    assert valid['date_naissance'].dt.strftime('%Y-%m-%d').tolist() == ['1996-01-01', '2010-12-31']


# --- clean ------------------------------------------------------------------------

def test_clean_writes_the_psp_schema(tmp_path):
    stats, paths = run_clean(tmp_path, write_input(
        tmp_path, 'F ; Élyra ; Quistane ; 1/2/2004; Elyra@Example.org ; AAH'))

    df = read(paths['clean'], quoting=csv.QUOTE_ALL)
    assert df.columns.tolist() == pipeline.CLEANED_COLUMNS
    row = df.iloc[0]
    assert (row['nom'], row['prenom'], row['genre']) == ('QUISTANE', 'ELYRA', 'F')
    assert row['date_naissance'] == '2004-02-01 04:00:00'
    assert (row['situation'], row['organisme']) == ('AAH', 'CAF')
    assert json.loads(row['allocataire']) == {
        'qualite': 'Mme', 'nom': 'QUISTANE', 'prenom': 'ELYRA', 'courriel': 'elyra@example.org'}
    assert row['adresse_allocataire'] == '{}'
    assert stats['beneficiaires'] == 1


def test_clean_offers_the_name_as_birth_and_usage_name_to_the_matching(tmp_path):
    _, paths = run_clean(tmp_path, write_input(
        tmp_path, 'M;Tozal;Mervik;07/08/2006;tozal@example.org;aah'))

    candidates = read(paths['match'])
    assert candidates.columns.tolist() == fc.MATCH_COLUMNS
    row = candidates.iloc[0]
    assert (row['situation'], row['organisme']) == ('AAH', 'CAF')
    assert (row['beneficiaire_nom'], row['beneficiaire_nom_usage']) == ('MERVIK', 'MERVIK')
    assert (row['beneficiaire_prenom'], row['beneficiaire_date_naissance'],
            row['beneficiaire_genre']) == ('TOZAL', '2006-08-07', 'M')
    assert row['allocataire_nom'] == '' and row['ine'] == ''


def test_clean_writes_the_cnaf_extra_field_row_aah_caf_reads(tmp_path):
    _, paths = run_clean(tmp_path, write_input(
        tmp_path, 'M;Tozal;Mervik;07/08/2006;tozal@example.org;aah'))
    assert read(paths['cnaf']).drop(columns='eligibility_result_id').to_dict('records') == [{
        'cnaf_allocataire_nom_naissance': 'MERVIK',
        'cnaf_allocataire_date_naissance': '2006-08-07',
        'cnaf_allocataire_genre': 'male',
    }]


def test_clean_keeps_the_names_as_typed_for_the_mail(tmp_path):
    _, paths = run_clean(tmp_path, write_input(
        tmp_path, 'F;Élyra;Quistane;01/02/2004;Elyra@Example.org;aah'))
    assert read(paths['identities']).drop(columns='eligibility_result_id').to_dict('records') == [{
        'nom': 'Quistane', 'prenom': 'Élyra', 'date_naissance': '2004-02-01',
        'email': 'elyra@example.org'}]


def test_clean_drops_duplicates_and_reports_them_with_the_rejects(tmp_path):
    stats, paths = run_clean(tmp_path, write_input(
        tmp_path,
        'M;Tozal;MERVIK;07/08/2006;tozal@example.org;aah',
        'X;Pim;Dorvat;07/08/2006;pim@example.org;aah',
        'm;tozal;mervik;07/08/2006;autre@example.org;aah'))

    assert (stats['beneficiaires'], stats['lignes_rejetees'], stats['doublons_retires']) == (1, 1, 1)
    rejects = read(paths['rejects'])
    assert rejects['ligne'].tolist() == ['3', '4']
    assert rejects['motif'].tolist()[1] == 'doublon de la ligne 2'


def test_clean_without_any_valid_row_writes_headers_only(tmp_path):
    stats, paths = run_clean(tmp_path, write_input(
        tmp_path, 'X;Pim;Dorvat;07/08/2006;pim@example.org;aah'))
    assert stats['beneficiaires'] == 0
    assert read(paths['clean']).empty
    assert read(paths['match']).columns.tolist() == fc.MATCH_COLUMNS


# --- known ------------------------------------------------------------------------

def test_split_known_sets_aside_matched_and_inconclusive(tmp_path):
    _, paths = run_clean(tmp_path, write_input(
        tmp_path,
        'M;Tozal;Mervik;07/08/2006;tozal@example.org;aah',
        'F;Elyra;Quistane;01/02/2004;elyra@example.org;aah',
        'F;Ola;Dorvat;01/02/2005;ola@example.org;aah'))
    ids = read(paths['identities'])['eligibility_result_id'].tolist()

    (tmp_path / 'matched.csv').write_text(f'eligibility_result_id;id_psp\n{ids[0]};26-AAAA-BBBB\n')
    (tmp_path / 'inconclusive.csv').write_text(f'eligibility_result_id\n{ids[1]}\n')

    stats = pipeline.split_known(
        paths['clean'], tmp_path / 'matched.csv', tmp_path / 'inconclusive.csv',
        paths['identities'], tmp_path / 'to_code.csv', tmp_path / 'known.csv',
        tmp_path / 'review.csv')

    assert (stats['deja_connus'], stats['a_verifier'], stats['a_coder']) == (1, 1, 1)
    assert read(tmp_path / 'to_code.csv', quoting=csv.QUOTE_ALL)['eligibility_result_id'].tolist() == [ids[2]]
    assert read(tmp_path / 'known.csv').to_dict('records') == [{
        'nom': 'Mervik', 'prenom': 'Tozal', 'date_naissance': '2006-08-07',
        'email': 'tozal@example.org', 'id_psp': '26-AAAA-BBBB'}]
    assert read(tmp_path / 'review.csv')['nom'].tolist() == ['Quistane']


# --- whole Python chain -----------------------------------------------------------

def test_chain_produces_the_production_drop_and_the_mail_input(tmp_path):
    _, paths = run_clean(tmp_path, write_input(
        tmp_path,
        'M;Tozal;Mervik;07/08/2006;tozal@example.org;aah',
        'F;Élyra;Quistane;01/02/2004;elyra@example.org;aah'))
    codes = tmp_path / 'codes.csv'
    codes.write_text('code\n')

    fc_pipeline.codes.generate_codes_for_file(paths['clean'], tmp_path / 'with_codes.csv', codes)
    fc_pipeline.split_writeback(
        tmp_path / 'with_codes.csv', tmp_path / 'writeback.csv', tmp_path / 'prod.csv',
        paths['cnaf'], tmp_path / 'lamp.csv')
    pipeline.build_emails(tmp_path / 'with_codes.csv', paths['identities'], tmp_path / 'emails.csv')

    prod = read(tmp_path / 'prod.csv', quoting=csv.QUOTE_ALL)
    assert prod.columns.tolist() == PROD_HEADER
    lamp = read(tmp_path / 'lamp.csv', quoting=csv.QUOTE_ALL)
    assert lamp.columns.tolist() == PROD_HEADER + fc.CNAF_EXTRA_FIELD_COLUMNS

    emails = read(tmp_path / 'emails.csv')
    assert emails.columns.tolist() == pipeline.EMAIL_COLUMNS
    assert emails['code'].tolist() == prod['id_psp'].tolist()
    assert emails[['prenom', 'date_naissance']].values.tolist() == [
        ['Tozal', '2006-08-07'], ['Élyra', '2004-02-01']]
    assert read(codes)['code'].tolist() == prod['id_psp'].tolist()


def test_build_emails_refuses_a_coded_row_without_identity(tmp_path):
    (tmp_path / 'with_codes.csv').write_text('"eligibility_result_id";"id_psp"\n"x";"26-AAAA-BBBB"\n')
    (tmp_path / 'identities.csv').write_text(';'.join(pipeline.IDENTITY_COLUMNS) + '\n')
    with pytest.raises(AssertionError, match="identité"):
        pipeline.build_emails(tmp_path / 'with_codes.csv', tmp_path / 'identities.csv',
                              tmp_path / 'emails.csv')
