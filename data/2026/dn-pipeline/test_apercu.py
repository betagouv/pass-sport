"""Tests of apercu.py, the read-only preview behind apercu_dn.sh.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_apercu.py
"""

import pytest
import requests

# First: it puts the partners and FranceConnect directories on sys.path.
import apercu

import mapping  # noqa: E402
from test_dn_pipeline import champ, dn_dossier, enfant  # noqa: E402

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
    assert ('à traiter (en instruction par un instructeur, FranceConnect, sans label) : 1 ; '
            'ignorés : sans FranceConnect 1') in out


def test_dn_extraction_shows_the_fetched_dossiers(tmp_path, capsys):
    dossier = dn_dossier(enfants=[enfant('Ola')])
    dossier['champs'].append(champ('Justificatif', 'justif.webp', 'PieceJustificativeChamp'))

    apercu.extract(tmp_path, {'demarche': 1234, 'labels': {}, 'dossiers': [dossier]}, show=True)

    out = capsys.readouterr().out
    assert 'dossier 34778465 (en_instruction)' in out
    assert '(INSEE 69052)' in out and 'Prénom de l\'enfant = Ola' in out
    assert 'dn:34778465:enfant-1' in out and 'schéma PSP' in out


def test_explain_turns_http_errors_into_hints():
    def http_error(status):
        response = requests.Response()
        response.status_code = status
        response.request = requests.Request('POST', 'https://dn.example/api/v2/graphql').prepare()
        return requests.HTTPError(response=response, request=response.request)

    assert 'accès refusé (401)' in apercu.explain(http_error(401))
    assert "vérifier l'URL de l'API" in apercu.explain(http_error(404))


def test_the_dossiers_to_process_are_cleaned_together_as_a_run_does(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(apercu, '_workdir', lambda prefix: tmp_path)
    # The same child in two dossiers, plus her sibling in the second one only.
    first = dn_dossier(1, beneficiaire_de='', enfants=[enfant('Ola', 'Dorvat')])
    second = dn_dossier(2, beneficiaire_de='', enfants=[enfant('Ola', 'Dorvat'), enfant('Lio', 'Dorvat')])
    password = dn_dossier(3, beneficiaire_de='', connectionUsager='password', enfants=[enfant('Eli', 'Dorvat')])

    work = apercu.preview(FakeDn([first, second, password], labels={}), 1234, 'extraction')

    identites = apercu._read(work, 'identites.csv')
    assert identites[['reference', 'prenom']].values.tolist() == [
        ['dn:1:enfant-1', 'Ola'], ['dn:2:enfant-2', 'Lio']]
    rejets = apercu._read(work, 'rejets.csv')
    assert rejets[['reference', 'motif']].values.tolist() == [['dn:2:enfant-1', 'doublon de dn:1:enfant-1']]
    assert f'{work}/dn-brut.json' in capsys.readouterr().out


def test_without_mode_only_the_overviews_run(capsys):
    assert apercu.preview(FakeDn([], labels={}), 1234, None) is None
    assert 'dossiers : 0' in capsys.readouterr().out
