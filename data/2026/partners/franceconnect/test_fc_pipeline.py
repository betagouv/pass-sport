"""Tests de fc_pipeline, l'enchaînement des étapes Python de la source FranceConnect.

Les règles métier qu'il enchaîne sont testées ailleurs — test_clean_fc_lib.py pour ce qui est
propre à cette source, ../test_partners_lib.py pour ce qui est partagé. Ce qui est vérifié
ici, c'est le contrat de bout en bout : ce que le CSV d'entrée devient, et surtout ce que la
cron dépose en production.

Lancer depuis data/ : source .venv/bin/activate && pytest 2026/partners/franceconnect/test_fc_pipeline.py
"""

import csv
import json

import pandas as pd
import pytest

import fc_pipeline as pipeline

# Le schéma exact que l'étape 3 attend en entrée.
COLONNES_PSP = {
    'eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'genre',
    'organisme', 'situation', 'allocataire', 'adresse_allocataire',
}


# --- Constructeurs de lignes ------------------------------------------------------
# L'export SQL sort une vingtaine de colonnes, toutes en texte : COPY ... force_quote *
# écrit un NULL en chaîne vide, et le nettoyage lit avec keep_default_na=False.

def export_row(**overrides) -> dict:
    row = {
        'eligibility_result_id': '11111111-1111-1111-1111-111111111111',
        'source': 'enfant',
        'created_at': '2026-08-01 09:00:00+00',
        'allocataire_fc_sub': 'sub-A',
        'residence_insee': '75056',
        'allocataire-nom_naissance': 'MARTIN',
        'allocataire-nom_usage': '',
        'allocataire-prenom': 'Claire',
        'allocataire-date_naissance': '1985-03-02',
        'allocataire-genre': 'female',
        'allocataire-code_insee_naissance': '75056',
        'allocataire-code_pays_naissance': '99100',
        'allocataire-courriel': 'Claire@Example.org',
        'enfant_nom': 'MARTIN',
        'enfant_prenom': 'Lea',
        'enfant_date_naissance': '2015-06-01',
        'qf_valeur': '650',
        'qf_fournisseur': 'CNAF',
        'qf_enfants': json.dumps([{
            'nom_naissance': 'MARTIN', 'prenoms': 'Lea',
            'date_naissance': '2015-06-01', 'sexe': 'F',
        }]),
        'aah_est_beneficiaire': '',
        'crous_est_boursier': '',
    }
    row.update(overrides)
    return row


def write_export(tmp_path, rows) -> str:
    """Écrit l'export brut comme psql le fait : virgule, tout entre guillemets."""
    filepath = tmp_path / 'fc_2026_eligible_pending.csv'
    pd.DataFrame(rows).to_csv(
        filepath, sep=',', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    return str(filepath)


def read_psp(filepath) -> pd.DataFrame:
    return pd.read_csv(
        filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False,
        quoting=csv.QUOTE_ALL,
    )


# --- Étape 2 : clean --------------------------------------------------------------

def test_clean_produit_le_schema_psp(tmp_path):
    input_filepath = write_export(tmp_path, [export_row()])
    output_filepath = tmp_path / 'FC_2026.csv'

    stats = pipeline.clean(input_filepath, output_filepath)

    df = read_psp(output_filepath)
    assert set(df.columns) == COLONNES_PSP
    assert stats['beneficiaires'] == 1
    assert df.loc[0, 'nom'] == 'MARTIN'
    assert df.loc[0, 'prenom'] == 'LEA'
    assert df.loc[0, 'genre'] == 'F'
    assert df.loc[0, 'situation'] == 'jeune'
    assert df.loc[0, 'organisme'] == 'CAF'
    # l'identité de l'allocataire est repliée dans la colonne JSON
    assert json.loads(df.loc[0, 'allocataire'])['prenom'] == 'CLAIRE'


def test_clean_conserve_la_cle_du_writeback(tmp_path):
    """Sans elle, l'étape 4 ne saurait pas quelles lignes marquer en base."""
    input_filepath = write_export(tmp_path, [export_row()])
    output_filepath = tmp_path / 'FC_2026.csv'

    pipeline.clean(input_filepath, output_filepath)

    df = read_psp(output_filepath)
    assert df.loc[0, 'eligibility_result_id'] == '11111111-1111-1111-1111-111111111111'
    # pas encore de code : c'est l'étape 3 qui les fabrique
    assert 'id_psp' not in df.columns


def test_clean_deduplique_un_enfant_remonte_par_ses_deux_parents(tmp_path):
    """Deux subs, deux lignes, un seul bénéficiaire — sinon deux codes pour un enfant."""
    autre_parent = export_row(
        eligibility_result_id='22222222-2222-2222-2222-222222222222',
        allocataire_fc_sub='sub-B',
        allocataire_prenom='Marc',
        **{'allocataire-courriel': 'marc@example.org'},
    )
    autre_parent.pop('allocataire_prenom')
    input_filepath = write_export(tmp_path, [export_row(), autre_parent])
    output_filepath = tmp_path / 'FC_2026.csv'

    stats = pipeline.clean(input_filepath, output_filepath)

    assert stats['doublons_retires'] == 1
    assert stats['beneficiaires'] == 1


def test_clean_ecarte_une_ligne_sans_situation(tmp_path):
    # ni quotient couvrant, ni AAH, ni AEEH, ni bourse : aucune route ne s'ouvre
    orphelin = export_row(
        eligibility_result_id='33333333-3333-3333-3333-333333333333',
        qf_valeur='1200', enfant_prenom='Paul', enfant_date_naissance='2014-02-02',
        qf_enfants=json.dumps([{
            'nom_naissance': 'MARTIN', 'prenoms': 'Paul',
            'date_naissance': '2014-02-02', 'sexe': 'M',
        }]),
    )
    input_filepath = write_export(tmp_path, [export_row(), orphelin])
    output_filepath = tmp_path / 'FC_2026.csv'

    stats = pipeline.clean(input_filepath, output_filepath)

    assert stats['sans_situation'] == 1
    assert stats['lignes_ecartees'] == 1
    assert stats['beneficiaires'] == 1


# --- Étape 4a : split_writeback ---------------------------------------------------

def write_with_codes(tmp_path, rows: int = 2) -> str:
    """Le fichier daté tel que l'étape 3 le laisse : le CSV nettoyé plus ses colonnes."""
    filepath = tmp_path / '2026-08-12-fc-with-codes.csv'
    pd.DataFrame({
        'eligibility_result_id': [f"1111111{i}-1111-1111-1111-111111111111" for i in range(rows)],
        'nom': ['MARTIN'] * rows,
        'prenom': ['LEA'] * rows,
        'genre': ['F'] * rows,
        'organisme': ['CAF'] * rows,
        'situation': ['jeune'] * rows,
        'exercice_id': [5] * rows,
        'id_psp': [f"26-AAAA-AAA{i}" for i in range(rows)],
    }).to_csv(filepath, sep=';', index=False, encoding='utf-8')
    return str(filepath)


def test_split_writeback(tmp_path):
    with_codes = write_with_codes(tmp_path, rows=3)
    writeback_filepath = tmp_path / 'fc_2026_writeback.csv'
    prod_filepath = tmp_path / '2026-08-12-fc-prod.csv'

    stats = pipeline.split_writeback(with_codes, writeback_filepath, prod_filepath)

    # le couple attendu par writeback_verdict.sql : deux colonnes, séparateur ';'
    df_writeback = pd.read_csv(writeback_filepath, sep=';', dtype=str)
    assert list(df_writeback.columns) == ['eligibility_result_id', 'id_psp']
    assert len(df_writeback) == 3

    # le CSV de prod, sans la colonne technique qui n'a rien à faire en base
    df_prod = read_psp(prod_filepath)
    assert 'eligibility_result_id' not in df_prod.columns
    assert df_prod['id_psp'].is_unique
    assert stats['beneficiaires'] == 3


def test_split_writeback_refuse_un_fichier_sans_code(tmp_path):
    """Un id_psp vide écrirait un code vide en base."""
    filepath = tmp_path / '2026-08-12-fc-with-codes.csv'
    pd.DataFrame({
        'eligibility_result_id': ['11111111-1111-1111-1111-111111111111'],
        'id_psp': [''],
    }).to_csv(filepath, sep=';', index=False, encoding='utf-8')

    with pytest.raises(AssertionError):
        pipeline.split_writeback(filepath, tmp_path / 'w.csv', tmp_path / 'p.csv')


def test_split_writeback_refuse_un_fichier_sans_cle(tmp_path):
    """Sans eligibility_result_id, le CSV ne vient pas de cette source."""
    filepath = tmp_path / '2026-08-12-fc-with-codes.csv'
    pd.DataFrame({'nom': ['MARTIN'], 'id_psp': ['26-AAAA-AAAA']}).to_csv(
        filepath, sep=';', index=False, encoding='utf-8')

    with pytest.raises(AssertionError):
        pipeline.split_writeback(filepath, tmp_path / 'w.csv', tmp_path / 'p.csv')


def test_prod_filepath_for():
    assert pipeline.prod_filepath_for('/tmp/2026-08-12-fc-with-codes.csv') == \
        '/tmp/2026-08-12-fc-prod.csv'


# --- Bout en bout : les 3 étapes Python enchaînées --------------------------------

def test_les_trois_etapes_enchainees(tmp_path):
    """Ce que run_fc_pipeline.sh exécute entre les deux passages psql."""
    input_filepath = write_export(tmp_path, [export_row()])
    cleaned_filepath = tmp_path / 'FC_2026.csv'
    with_codes_filepath = tmp_path / '2026-08-12-fc-with-codes.csv'
    prod_filepath = tmp_path / '2026-08-12-fc-prod.csv'

    pipeline.clean(input_filepath, cleaned_filepath)
    pipeline.codes.generate_codes_for_file(
        cleaned_filepath, with_codes_filepath, tmp_path / 'codes.csv')
    pipeline.split_writeback(
        with_codes_filepath, tmp_path / 'fc_2026_writeback.csv', prod_filepath)

    df_prod = read_psp(prod_filepath)
    df_writeback = pd.read_csv(tmp_path / 'fc_2026_writeback.csv', sep=';', dtype=str)

    # le fichier déposé pour la production porte allocataire, bénéficiaire et code
    assert {'allocataire', 'nom', 'prenom', 'id_psp'} <= set(df_prod.columns)
    assert 'eligibility_result_id' not in df_prod.columns
    assert df_prod.loc[0, 'id_psp'].startswith('26-')
    # et le code parti en production est bien celui que le SQL va écrire en base
    assert df_writeback.loc[0, 'id_psp'] == df_prod.loc[0, 'id_psp']
    assert df_writeback.loc[0, 'eligibility_result_id'] == \
        '11111111-1111-1111-1111-111111111111'
