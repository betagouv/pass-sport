"""Unit tests of dn_doublons, behind run_dn_doublons.sh. No API, no database.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_dn_doublons.py
"""

import subprocess
from pathlib import Path

import pandas as pd
import pytest

# First: it puts the partners and FranceConnect directories on sys.path.
import dn_doublons

import mapping  # noqa: E402
from dn_client import DnMutationError  # noqa: E402
from test_dn_pipeline import FakeDn as BaseFakeDn  # noqa: E402
from test_dn_pipeline import dn_dossier, enfant, read  # noqa: E402

LABEL = mapping.DN_LABEL_DOUBLON_POTENTIEL
NOTES = mapping.DN_ANNOTATION_NOTES_CONSTRUCTION
FOLLOWER = {'id': 'I-follower', 'email': 'follower@example.org'}
LINE = 'Doublon potentiel pour Léa Martin 12/03/2015 : '
SETUP = {NOTES: {'id': 'A-notes', 'type': mapping.DN_ANNOTATION_TYPE}}


class FakeDn(BaseFakeDn):
    def __init__(self, dossiers, labels=None, annotations=None):
        super().__init__(dossiers, labels={LABEL: 'L-doublon'} if labels is None else labels,
                         annotations=SETUP if annotations is None else annotations)
        self.states = []

    def iter_dossiers(self, numero, state='en_instruction'):
        self.states.append(state)
        yield from self._dossiers


def dossier(number=1, notes=None, followers=(FOLLOWER,), child=None, annotated=True, **overrides):
    annotations = [{'id': 'A-notes', 'label': NOTES, 'stringValue': notes}] if annotated else []
    return dn_dossier(number, beneficiaire_de='', enfants=[child or enfant('Léa', 'Martin')],
                      state='en_construction', instructeurs=list(followers),
                      annotations=annotations, id=f'D{number}', **overrides)


def matching(*codes, number=1):
    """lamp01 knows the first child of dossier `number` under these codes."""
    def match(candidates):
        return pd.DataFrame({'eligibility_result_id': [f'dn:{number}:enfant-1'] * len(codes),
                             'id_psp': list(codes), 'type': ['exacte'] * len(codes)},
                            dtype=str)
    return match


def no_match(candidates):
    return pd.DataFrame(columns=['eligibility_result_id', 'id_psp', 'type'], dtype=str)


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setenv('DN_DEMARCHE_NUMBER', '1234')
    monkeypatch.delenv('DN_DOSSIERS', raising=False)


def run(tmp_path, client, match=no_match, dry_run=False):
    return dn_doublons.doublons(tmp_path / 'doublons.csv', dry_run, client, match)


def test_reads_only_the_dossiers_en_construction(tmp_path):
    client = FakeDn([])
    run(tmp_path, client)
    assert client.states == ['en_construction']


@pytest.mark.parametrize('labels, annotations, error', [
    ({}, SETUP, 'label'),
    ({LABEL: 'L'}, {}, 'annotation'),
    ({LABEL: 'L'}, {NOTES: {'id': 'A', 'type': 'TextChampDescriptor'}}, 'annotation'),
])
def test_refuses_a_demarche_without_its_setup(tmp_path, labels, annotations, error):
    client = FakeDn([dossier()], labels=labels, annotations=annotations)
    with pytest.raises(ValueError, match=error):
        run(tmp_path, client, matching('C1'))
    assert client.calls == []


def test_the_label_and_annotation_are_compared_folded(tmp_path):
    client = FakeDn([dossier()], labels={'doublon POTENTIEL': 'L-doublon'},
                    annotations={NOTES.upper(): SETUP[NOTES]})
    run(tmp_path, client, matching('C1'))
    assert [call[0] for call in client.calls] == ['annotation', 'label']


def test_the_label_is_not_one_the_pipeline_skips():
    assert mapping.fold(LABEL) not in {mapping.fold(name) for name in mapping.DN_LABELS.values()}


@pytest.mark.parametrize('overrides', [
    {'followers': ()},
    {'labels': [{'id': 'L', 'name': 'doublon POTENTIEL'}]},
])
def test_a_dossier_without_follower_or_already_labelled_is_left_alone(tmp_path, overrides):
    def match(candidates):
        pytest.fail('dossier écarté comparé quand même')

    client = FakeDn([dossier(notes=f'{LINE}OLD', **overrides)])
    stats = run(tmp_path, client, match)
    assert client.calls == []
    assert stats['dossiers_examines'] == 0


def test_counts_the_dossiers_left_alone_once_each(tmp_path):
    labelled = [{'id': 'L', 'name': LABEL}]
    client = FakeDn([dossier(1, labels=labelled),
                     dossier(2, labels=labelled, followers=()),
                     dossier(3, followers=()),
                     dossier(4, labels=[{'id': 'L', 'name': 'FranceConnect'}])])
    stats = run(tmp_path, client)
    assert (stats['dossiers_deja_labellises'], stats['dossiers_sans_instructeur'],
            stats['dossiers_examines']) == (2, 1, 1)


def test_another_label_does_not_stop_the_dossier(tmp_path):
    client = FakeDn([dossier(labels=[{'id': 'L', 'name': 'FranceConnect'}])])
    run(tmp_path, client, matching('C1'))
    assert [call[0] for call in client.calls] == ['annotation', 'label']


def test_writes_as_the_first_follower_by_email(tmp_path):
    client = FakeDn([dossier(followers=({'id': 'I-z', 'email': 'zoe@example.org'},
                                        {'id': 'I-a', 'email': 'Abel@example.org'}))])
    run(tmp_path, client, matching('C1'))
    assert client.answered_as[('annotation', 'D1')] == 'I-a'


def test_annotates_then_labels_one_sorted_line_per_code(tmp_path):
    client = FakeDn([dossier()])
    stats = run(tmp_path, client, matching('C2', 'C1', 'C2'))

    assert client.calls == [('annotation', 'D1', 'A-notes', f'{LINE}C1\n{LINE}C2'),
                            ('label', 'D1', 'L-doublon')]
    assert (stats['dossiers_avec_doublon'], stats['actions_faites'], stats['erreurs']) == (1, 2, 0)


def test_compares_with_the_data_of_the_dossiers_en_instruction(tmp_path):
    seen = {}

    def match(candidates):
        seen['candidates'] = candidates
        return no_match(candidates)

    run(tmp_path, FakeDn([dossier()]), match)

    row = seen['candidates'].iloc[0]
    assert (row['eligibility_result_id'], row['situation'], row['date_naissance']) == (
        'dn:1:enfant-1', 'AEEH', '2015-03-12')
    assert row['allocataire_nom'] == 'Dorvat'
    assert 'genre' not in seen['candidates'].columns


def test_a_rejected_line_is_not_compared(tmp_path):
    def match(candidates):
        pytest.fail('ligne rejetée comparée quand même')

    client = FakeDn([dossier(child=enfant('Léa', 'Martin', genre='X'))])
    run(tmp_path, client, match)
    assert client.calls == []


def test_keeps_the_notes_typed_by_hand_before_its_lines(tmp_path):
    client = FakeDn([dossier(notes=f'Rappeler la famille\n{LINE}OLD\nPièce manquante')])
    run(tmp_path, client, matching('C1'))
    assert client.calls[0] == ('annotation', 'D1', 'A-notes',
                               f'Rappeler la famille\nPièce manquante\n{LINE}C1')


def test_without_correspondence_removes_only_its_own_lines_and_adds_no_label(tmp_path):
    client = FakeDn([dossier(notes=f'Rappeler la famille\n{LINE}OLD')])
    run(tmp_path, client)
    assert client.calls == [('annotation', 'D1', 'A-notes', 'Rappeler la famille')]


def test_without_correspondence_empties_an_annotation_holding_only_its_lines(tmp_path):
    client = FakeDn([dossier(notes=f'{LINE}OLD')])
    run(tmp_path, client)
    assert client.calls == [('annotation', 'D1', 'A-notes', '')]


@pytest.mark.parametrize('notes', [None, '', 'Rappeler la famille', 'Rappeler\r\nla famille\n'])
def test_without_correspondence_nor_line_of_its_own_writes_nothing(tmp_path, notes):
    client = FakeDn([dossier(notes=notes)])
    stats = run(tmp_path, client)
    assert client.calls == []
    assert stats['actions_faites'] == 0


def test_an_unchanged_text_is_not_written_again_and_the_label_is_retried(tmp_path):
    client = FakeDn([dossier(notes=f'{LINE}C1\r\n')])
    run(tmp_path, client, matching('C1'))
    assert client.calls == [('label', 'D1', 'L-doublon')]


def test_a_dossier_missing_the_annotation_is_an_error_only_with_something_to_write(tmp_path):
    client = FakeDn([dossier(1, annotated=False), dossier(2, annotated=False)])

    stats = run(tmp_path, client, matching('C1', number=1))

    assert client.calls == []
    assert stats['erreurs'] == 1
    assert read(tmp_path / 'doublons.csv')['reference'].tolist() == ['dn:1']


def test_a_refused_annotation_adds_no_label_and_the_next_run_retries(tmp_path):
    client = FakeDn([dossier(1), dossier(2, child=enfant('Léa', 'Martin'))])
    client.refuse[('annotation', 'D1')] = DnMutationError('refusé')

    def match(candidates):
        return pd.DataFrame({'eligibility_result_id': ['dn:1:enfant-1', 'dn:2:enfant-1'],
                             'id_psp': ['C1', 'C2'], 'type': ['exacte', 'exacte']}, dtype=str)

    first = run(tmp_path, client, match)
    assert first['erreurs'] == 1
    assert [call[:2] for call in client.calls] == [('annotation', 'D2'), ('label', 'D2')]

    client.calls.clear()
    client.refuse.clear()
    run(tmp_path, client, match)
    assert ('annotation', 'D1') in [call[:2] for call in client.calls]
    assert ('label', 'D1') in [call[:2] for call in client.calls]


def test_dn_dossiers_limits_the_dossiers_examined(tmp_path, monkeypatch):
    monkeypatch.setenv('DN_DOSSIERS', '2')
    client = FakeDn([dossier(1), dossier(2)])
    stats = run(tmp_path, client, matching('C1', number=2))
    assert stats['dossiers_examines'] == 1
    assert {call[1] for call in client.calls} == {'D2'}


def test_dry_run_writes_nothing_and_shows_the_exact_text(tmp_path):
    client = FakeDn([dossier(notes='Rappeler la famille')])

    stats = run(tmp_path, client, matching('C1'), dry_run=True)

    assert client.calls == []
    assert stats['actions_simulees'] == 2
    journal = read(tmp_path / 'doublons.csv')
    assert journal['statut'].tolist() == ['simule', 'simule']
    assert journal['detail'].tolist() == [f'Rappeler la famille {LINE}C1', LABEL]


def test_a_real_run_keeps_no_identity_in_its_journal(tmp_path):
    run(tmp_path, FakeDn([dossier()]), matching('C1'))
    text = (tmp_path / 'doublons.csv').read_text(encoding='utf-8')
    assert 'Martin' not in text and 'C1' not in text and '1 ligne(s)' in text


def test_a_label_refused_is_journalled(tmp_path):
    client = FakeDn([dossier()])
    client.refuse[('label', 'D1')] = DnMutationError('refusé')
    stats = run(tmp_path, client, matching('C1'))
    assert (stats['actions_faites'], stats['erreurs']) == (1, 1)


@pytest.fixture
def lamp_settings(monkeypatch):
    for name, value in (('LAMP_DB_HOST', 'h'), ('LAMP_DB_PORT', '55433'), ('LAMP_DB_USER', 'u'),
                        ('LAMP_DB_NAME', 'db'), ('LAMP_DB_PASSWORD', 'secret'), ('FC_EXERCICE_ID', '7')):
        monkeypatch.setenv(name, value)


def test_lamp01_matches_runs_psql_on_the_candidates_of_a_private_directory(monkeypatch, lamp_settings):
    seen = {}

    def fake_run(args, cwd, check, stdout, env):
        seen.update(args=args, cwd=cwd, env=env, candidates=(Path(cwd) / 'dn_candidats.csv').read_text())
        output = next(arg.split('=', 1)[1] for arg in args if arg.startswith('correspondances='))
        Path(output).write_text('eligibility_result_id;id_psp;type\nr1;C1;exacte\n')

    monkeypatch.setattr(subprocess, 'run', fake_run)
    candidates = pd.DataFrame([{column: 'x' for column in dn_doublons.pipeline.MATCH_COLUMNS}])

    found = dn_doublons.lamp01_matches(candidates)

    assert found.values.tolist() == [['r1', 'C1', 'exacte']]
    assert seen['env']['PGPASSWORD'] == 'secret'
    assert 'secret' not in ' '.join(seen['args'])
    assert seen['args'][seen['args'].index('-p') + 1] == '55433'
    assert 'exercice=7' in seen['args'] and 'touchees=/dev/null' in seen['args']
    assert seen['candidates'].startswith(';'.join(dn_doublons.pipeline.MATCH_COLUMNS))
    assert not Path(seen['cwd']).exists()


def test_lamp01_matches_leaves_no_file_behind_on_failure(monkeypatch, lamp_settings):
    seen = {}

    def failing_run(args, cwd, check, stdout, env):
        seen['cwd'] = cwd
        raise subprocess.CalledProcessError(2, 'psql')

    monkeypatch.setattr(subprocess, 'run', failing_run)
    candidates = pd.DataFrame(columns=dn_doublons.pipeline.MATCH_COLUMNS)

    with pytest.raises(subprocess.CalledProcessError):
        dn_doublons.lamp01_matches(candidates)
    assert not Path(seen['cwd']).exists()
