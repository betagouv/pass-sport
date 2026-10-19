"""Tests of apercu.py, the read-only previews behind apercu_dn.sh and apercu_grist.sh.

Run from data/ : source .venv/bin/activate && pytest 2026/grist-dn-pipeline/test_apercu.py
"""

import pytest
import requests

# First: it puts the partners and FranceConnect directories on sys.path.
import apercu

import mapping  # noqa: E402
from test_grist_dn_pipeline import champ, dn_dossier, enfant  # noqa: E402

GRIST_IDS = {name: f'col_{name}' for name in mapping.GRIST_COLUMNS}


class FakeGrist:
    def __init__(self, records, tables=('Beneficiaires',), missing=()):
        self._records = records
        self._tables = list(tables)
        self._specs = [{'id': GRIST_IDS[name], 'label': label, 'type': 'Text'}
                       for name, label in mapping.GRIST_COLUMNS.items() if name not in missing]

    def tables(self):
        return self._tables

    def column_specs(self, table_id):
        return self._specs

    def columns(self, table_id):
        return {spec['label']: spec['id'] for spec in self._specs}

    def records(self, table_id):
        return self._records


def grist_row(row_id, **fields):
    values = {'caisse': 'CAF', 'genre': 'F', 'prenom': 'Ola', 'nom': 'Dorvat',
              'date_naissance': 1426118400, 'situation': 'AEEH', 'allocataire_genre': 'M',
              'allocataire_prenom': 'Pim', 'allocataire_nom': 'Dorvat', 'matricule': '',
              'email': 'pim@example.org', 'code_insee': '', 'eligibilite': 'Oui',
              'commentaire': '', 'statut': None, **fields}
    return {'id': row_id, 'fields': {GRIST_IDS[name]: value for name, value in values.items()}}


class FakeDn:
    def __init__(self, dossiers, labels, annotations=None):
        self._dossiers, self._labels = dossiers, labels
        self._annotations = annotations if annotations is not None else {
            mapping.DN_ANNOTATION_CODES: {'id': 'A', 'type': mapping.DN_ANNOTATION_TYPE}}

    def labels(self, numero):
        return self._labels

    def annotations(self, numero):
        return self._annotations

    def iter_dossiers(self, numero, state='en_instruction'):
        yield from self._dossiers


def test_grist_overview_compares_columns_and_reads_the_values_met(capsys):
    client = FakeGrist([
        grist_row(1), grist_row(2, situation='Autre', caisse='RSI'),
        grist_row(3, eligibilite='Non', statut='Doublon'),
    ], missing=('commentaire',))

    apercu.grist_overview(client, 'Beneficiaires', 'Motif')

    out = capsys.readouterr().out
    assert 'table Beneficiaires : accès OK (14 colonnes, 3 lignes)' in out
    assert 'ABSENT  commentaire' in out and 'ABSENT  motif' in out
    assert 'ok      caisse' in out
    assert '-> AEEH' in out and '-> INCONNUE : ligne rejetée' in out
    assert '-> CAF' in out and 'RSI' in out
    assert '-> déjà traitée : ignorée' in out
    assert 'lignes à traiter (éligibles, Statut vide) : 2' in out
    assert 'Ola' not in out and 'pim@example.org' not in out


def test_grist_overview_lists_the_tables_when_the_one_configured_is_missing():
    with pytest.raises(ValueError, match='tables : Table1, Feuille2'):
        apercu.grist_overview(FakeGrist([], tables=('Table1', 'Feuille2')), 'Beneficiaires')


def test_grist_extraction_cleans_the_rows_to_process(tmp_path, capsys):
    client = FakeGrist([grist_row(1), grist_row(2, genre='X'), grist_row(3, statut='Doublon')])
    raw = apercu.pipeline.fetch_grist(client, 'Beneficiaires')

    stats = apercu.extract(tmp_path, raw, {'dossiers': [], 'labels': {}}, show=True)

    assert (stats['beneficiaires'], stats['lignes_rejetees']) == (1, 1)
    out = capsys.readouterr().out
    assert 'ligne 1' in out and 'genre inconnu : X' in out
    assert '2015-03-12' in out
    assert (tmp_path / 'beneficiaires-clean.csv').exists() and (tmp_path / 'identites.csv').exists()


def test_dn_overview_flags_missing_labels_and_champs(capsys):
    dossier = dn_dossier(enfants=[enfant()])
    dossier['champs'] = [c for c in dossier['champs'] if c['label'] != mapping.DN_CHAMPS['ine']]
    client = FakeDn([dossier], labels={'Traité': 'L1', 'Complet': 'L9'})

    dossiers = apercu.dn_overview(client, 1234)

    out = capsys.readouterr().out
    assert dossiers == [dossier]
    assert 'ok      Traité' in out and 'ABSENT  À vérifier' in out
    assert 'ok      Codes pass Sport (Texte long)' in out
    assert 'ABSENT  ine' in out and 'ok      enfants' in out
    assert 'Pim' not in out


@pytest.mark.parametrize('annotations, shown', [
    ({}, 'ABSENT  Codes pass Sport (Texte long)'),
    ({'codes PASS sport': {'id': 'A', 'type': 'TextChampDescriptor'}},
     'TYPE ? Codes pass Sport : TextChampDescriptor, attendu Texte long'),
])
def test_dn_overview_flags_a_missing_or_mistyped_codes_annotation(capsys, annotations, shown):
    apercu.dn_overview(FakeDn([], labels={}, annotations=annotations), 1234)
    assert shown in capsys.readouterr().out


def test_dn_to_process_keeps_france_connect_dossiers_en_instruction_without_pipeline_label():
    labelled = dn_dossier(2, labels=[{'id': 'L1', 'name': 'traité'}])
    accepted = dn_dossier(3, state='accepte')
    password = dn_dossier(4, connectionUsager='password')
    assert [d['number'] for d in apercu.dn_to_process([dn_dossier(1), labelled, accepted, password])] == [1]


def test_dn_overview_counts_the_dossiers_to_process(capsys):
    apercu.dn_overview(FakeDn([dn_dossier(1), dn_dossier(2, connectionUsager='password')], labels={}), 1234)
    out = capsys.readouterr().out
    assert 'connexion : france_connect 1, password 1' in out
    assert 'à traiter (en instruction, FranceConnect, sans label) : 1 ; ignorés : sans FranceConnect 1' in out


def test_dn_extraction_shows_the_fetched_dossiers(tmp_path, capsys):
    dossier = dn_dossier(enfants=[enfant('Ola')])
    dossier['champs'].append(champ('Justificatif', 'justif.webp', 'PieceJustificativeChamp'))

    apercu.extract(tmp_path, {'records': [], 'columns': {}},
                   {'demarche': 1234, 'labels': {}, 'dossiers': [dossier]}, show=True)

    out = capsys.readouterr().out
    assert 'dossier 34778465 (en_instruction)' in out
    assert '(INSEE 69052)' in out and 'Prénom de l\'enfant = Ola' in out
    assert 'dn:34778465:enfant-1' in out and 'schéma PSP' in out


def test_explain_turns_http_errors_into_hints():
    def http_error(status):
        response = requests.Response()
        response.status_code = status
        response.request = requests.Request('GET', 'https://grist.example/api/docs/x/tables').prepare()
        return requests.HTTPError(response=response, request=response.request)

    assert 'accès refusé (401)' in apercu.explain(http_error(401))
    assert "vérifier l'URL de l'API" in apercu.explain(http_error(404))


def test_both_sources_are_cleaned_together_as_a_run_does(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(apercu, '_workdir', lambda prefix: tmp_path)
    grist = FakeGrist([grist_row(1, prenom='Ola', nom='Dorvat')])
    # The same child in both sources, plus her sibling only in DN.
    dossier = dn_dossier(beneficiaire_de='', enfants=[enfant('Ola', 'Dorvat'), enfant('Lio', 'Dorvat')])

    work = apercu.preview(('grist', 'dn'), 'extraction', grist=(grist, 'Beneficiaires', ''),
                          dn=(FakeDn([dossier], labels={}), 1234))

    out = capsys.readouterr().out
    assert '===== Grist =====' in out and '===== Démarches Numériques =====' in out
    identites = apercu._read(work, 'identites.csv')
    assert identites[['reference', 'source', 'prenom']].values.tolist() == [
        ['grist:1', 'grist', 'Ola'], ['dn:34778465:enfant-2', 'dn', 'Lio']]
    rejets = apercu._read(work, 'rejets.csv')
    assert rejets[['reference', 'motif']].values.tolist() == [['dn:34778465:enfant-1', 'doublon de grist:1']]
    assert f'{work}/grist-brut.json et {work}/dn-brut.json' in out


def test_without_mode_only_the_overviews_run(capsys):
    assert apercu.preview(('dn',), None, dn=(FakeDn([], labels={}), 1234)) is None
    assert 'dossiers : 0' in capsys.readouterr().out
