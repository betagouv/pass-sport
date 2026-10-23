"""Integration tests of match_grist_dn.sql against a throwaway lamp01 schema.

Spins up postgres:18-alpine with lamp01/db-init mounted, seeds `beneficiaires`, runs the SQL
on a candidate CSV with the exact MATCH_COLUMNS header and reads back its two outputs.
Skipped when docker is absent or down.

Run from data/ : source .venv/bin/activate && pytest 2026/grist-dn-pipeline/test_match_grist_dn.py
"""

import csv
import io
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pytest

import grist_dn_pipeline as pipeline

PIPELINE_DIR = Path(__file__).resolve().parent
DB_INIT_DIR = PIPELINE_DIR.parents[2] / 'lamp01' / 'db-init'

RECAP_COLUMNS = ['candidats', 'par_ine', 'par_exacte', 'par_parent', 'a_verifier', 'sans_correspondance']

# The parent of base_row()'s child, as Grist or DN gives it.
PARENT = {'allocataire_nom': 'Martin', 'allocataire_prenom': 'Claire', 'allocataire_genre': 'F'}


@pytest.fixture(scope='module')
def pg():
    if shutil.which('docker') is None:
        pytest.skip('docker introuvable')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'grist-dn-match-{uuid.uuid4().hex[:8]}'
    started = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=u_passsport',
         '-e', 'POSTGRES_DB=passsport',
         '-v', f'{DB_INIT_DIR}:/docker-entrypoint-initdb.d:ro', 'postgres:18-alpine'],
        capture_output=True, text=True)
    if started.returncode != 0:
        pytest.skip(f'conteneur postgres impossible à lancer : {started.stderr.strip()}')

    try:
        for _ in range(120):
            ready = subprocess.run(
                ['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport',
                 '-Atc', 'select 1 from public.beneficiaires limit 1'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            pytest.fail("le schéma lamp01 ne s'est pas chargé")
        yield name
    finally:
        subprocess.run(['docker', 'stop', name], capture_output=True)


def _literal(value) -> str:
    if value is None or value == '':
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"


def base_row(**overrides) -> dict:
    """One beneficiaires row: a CAF 'jeune' child of exercice 5, birthdate shifted by 4 h."""
    return {
        'id_psp': 'PSP-1', 'nom': 'MARTIN', 'prenom': 'LEA',
        'date_naissance': '2015-03-12 04:00:00', 'genre': 'F', 'organisme': 'CAF',
        'situation': 'jeune', 'allocataire_matricule': None, 'allocataire_qualite': 'Mme',
        'allocataire_nom': 'MARTIN', 'allocataire_prenom': 'CLAIRE', 'exercice_id': 5, **overrides,
    }


def candidate(**overrides) -> dict:
    return {'eligibility_result_id': 'c1', 'situation': 'AEEH', 'ine': '', 'nom': 'Martin',
            'prenom': 'Léa', 'date_naissance': '2015-03-12', 'genre': 'F', **overrides}


def match(pg, base=(), candidates=(), exercices=()):
    """Seeds lamp01, runs the SQL, returns ({(id, id_psp): type}, touched rows, recap)."""
    seed = ['truncate table public.beneficiaire_cnaf_extra_field, public.beneficiaires;']
    seed += [f"insert into public.exercices (id, libelle) values ({e}, 'test') on conflict do nothing;"
             for e in exercices]
    seed += ['insert into public.beneficiaires ({}) values ({});'.format(
        ', '.join(row), ', '.join(_literal(v) for v in row.values())) for row in base]
    seeded = subprocess.run(
        ['docker', 'exec', '-i', pg, 'psql', '-U', 'u_passsport', '-d', 'passsport',
         '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'], input='\n'.join(seed), capture_output=True,
        text=True)
    assert seeded.returncode == 0, seeded.stderr

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=pipeline.MATCH_COLUMNS, delimiter=';')
    writer.writeheader()
    writer.writerows(candidates)

    workdir = f'/tmp/match-{uuid.uuid4().hex[:8]}'
    subprocess.run(['docker', 'exec', pg, 'mkdir', '-p', workdir], check=True)
    for filename, content in (('grist_dn_candidats.csv', buffer.getvalue()),
                              ('match_grist_dn.sql', (PIPELINE_DIR / 'match_grist_dn.sql').read_text())):
        subprocess.run(['docker', 'exec', '-i', pg, 'sh', '-c', f'cat > {workdir}/{filename}'],
                       input=content, text=True, check=True)

    run = subprocess.run(
        ['docker', 'exec', '-w', workdir, pg, 'psql', '-U', 'u_passsport', '-d', 'passsport',
         '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-f', 'match_grist_dn.sql'],
        capture_output=True, text=True)
    assert run.returncode == 0, run.stderr

    def read(filename):
        content = subprocess.run(['docker', 'exec', pg, 'cat', f'{workdir}/{filename}'],
                                 capture_output=True, text=True, check=True).stdout
        return list(csv.DictReader(io.StringIO(content), delimiter=';'))

    correspondences = {(row['eligibility_result_id'], row['id_psp']): row['type']
                       for row in read('correspondances.csv')}
    touched = read('lamp01-touchees.csv')
    recap_line = [line for line in run.stdout.splitlines() if '|' in line][-1]
    recap = dict(zip(RECAP_COLUMNS, (int(v) for v in recap_line.split('|')), strict=True))
    return correspondences, touched, recap


def test_exact_whatever_the_situation_the_caisse_and_the_gender(pg):
    correspondences, touched, recap = match(
        pg, base=[base_row(situation='jeune', organisme='MSA', genre='M')],
        candidates=[candidate(situation='AEEH')])

    assert correspondences == {('c1', 'PSP-1'): 'exacte'}
    assert [row['id_psp'] for row in touched] == ['PSP-1']
    assert touched[0]['date_naissance'] == '2015-03-12'
    assert touched[0].keys() == set(pipeline.TOUCHED_COLUMNS)
    assert recap == {'candidats': 1, 'par_ine': 0, 'par_exacte': 1, 'par_parent': 0, 'a_verifier': 0,
                     'sans_correspondance': 0}


@pytest.mark.parametrize('lamp, typed', [
    ({'prenom': 'LEA ROSE'}, {'prenom': 'Léa'}),
    ({'nom': 'MARTIN DUPONT'}, {'nom': 'Martin'}),
    ({'nom': 'MARTIN-DUPONT'}, {'nom': 'Dupont'}),
])
def test_close_when_one_name_matches_and_the_other_shares_a_word(pg, lamp, typed):
    correspondences, _, recap = match(pg, base=[base_row(**lamp)], candidates=[candidate(**typed)])
    assert correspondences == {('c1', 'PSP-1'): 'proche'}
    assert recap['a_verifier'] == 1


@pytest.mark.parametrize('lamp, typed', [
    ({}, {'prenom': 'Leah'}),                                       # the child's first name mistyped
    ({'nom': 'DUPONT'}, {}),                                        # the child under another family name
    ({'prenom': 'TOM'}, {}),                                        # twins: same parent, same day
    ({'allocataire_qualite': None}, {'prenom': 'Leah'}),            # parent's genre unknown in lamp01
    ({}, {'prenom': 'Leah', 'allocataire_genre': ''}),              # ... or unknown as typed
    ({'allocataire_qualite': 'MME', 'allocataire_nom': 'MARTÍN'}, {'prenom': 'Leah'}),  # raw civilité, accents
])
def test_same_birth_date_and_same_parent_is_to_review(pg, lamp, typed):
    correspondences, _, recap = match(pg, base=[base_row(**lamp)], candidates=[candidate(**{**PARENT, **typed})])
    assert correspondences == {('c1', 'PSP-1'): 'parent'}
    assert (recap['par_parent'], recap['a_verifier']) == (1, 1)


@pytest.mark.parametrize('lamp, typed', [
    ({'allocataire_qualite': 'M'}, {}),                             # a father where a mother was typed
    ({'allocataire_prenom': 'PAUL'}, {}),                           # another parent
    ({'date_naissance': '2015-03-13 04:00:00'}, {}),                # another day
    ({'allocataire_nom': None, 'allocataire_prenom': None}, {}),    # no parent known in lamp01
    ({}, {'situation': 'AAH'}),                                     # an adult: no parent to compare
])
def test_no_same_parent_correspondence(pg, lamp, typed):
    correspondences, _, _ = match(pg, base=[base_row(**lamp)],
                                  candidates=[candidate(**{**PARENT, 'prenom': 'Leah', **typed})])
    assert correspondences == {}


def test_the_parent_is_never_required_by_the_other_types(pg):
    correspondences, _, _ = match(
        pg, base=[base_row(allocataire_prenom='PAUL', allocataire_qualite='M'),
                  base_row(id_psp='PSP-2', prenom='LEA ROSE')],
        candidates=[candidate(**PARENT)])
    # Declared by its other parent, the child is still an exact match; a pair found as proche
    # is not listed again as parent.
    assert correspondences == {('c1', 'PSP-1'): 'exacte', ('c1', 'PSP-2'): 'proche'}


@pytest.mark.parametrize('lamp', [
    {'prenom': 'TOM'},                                  # twin: same name, same date
    {'nom': 'DURAND'},                                  # another Léa born that day
    {'date_naissance': '2015-03-13 04:00:00'},          # another day
    {'exercice_id': 4},                                 # a previous campaign
    {'id_psp': None},                                   # never coded
])
def test_no_correspondence(pg, lamp):
    correspondences, touched, recap = match(pg, base=[base_row(**lamp)], candidates=[candidate()],
                                            exercices=[4])
    assert correspondences == {}
    assert touched == []
    assert recap['sans_correspondance'] == 1


def test_ine_for_boursiers_only(pg):
    correspondences, _, _ = match(
        pg,
        base=[base_row(id_psp='PSP-B', nom='DORVAT', prenom='PIM', date_naissance='2001-01-01',
                       organisme='cnous', situation='boursier', allocataire_matricule='0A1B2C3D4E5'),
              base_row(id_psp='PSP-C', nom='KER', prenom='ANA', allocataire_matricule='1234567')],
        candidates=[candidate(eligibility_result_id='b', situation='boursier', ine='0A1B2C3D4E5',
                              nom='Autre', prenom='Nom', date_naissance='2002-02-02'),
                    candidate(eligibility_result_id='c', situation='AEEH', ine='1234567',
                              nom='Autre', prenom='Nom')])
    assert correspondences == {('b', 'PSP-B'): 'ine'}


@pytest.mark.parametrize('lamp, kind', [
    ({'situation': 'boursier', 'organisme': 'cnous'}, 'exacte'),
    ({'situation': 'AAH'}, 'identite'),                                    # known under another aid
    ({'situation': 'boursier', 'organisme': 'cnous', 'genre': 'M'}, 'identite'),
    ({'situation': 'boursier', 'organisme': 'cnous', 'genre': None}, 'identite'),
])
def test_a_boursier_without_ine_is_a_doublon_only_with_the_same_genre_as_a_boursier(pg, lamp, kind):
    correspondences, _, recap = match(pg, base=[base_row(**lamp)],
                                      candidates=[candidate(situation='boursier', ine='')])
    assert correspondences == {('c1', 'PSP-1'): kind}
    assert recap['a_verifier'] == (kind == 'identite')


def test_genre_and_situation_only_matter_for_a_boursier_without_ine(pg):
    correspondences, _, _ = match(
        pg, base=[base_row(situation='AAH', genre='M')],
        candidates=[candidate(eligibility_result_id='b', situation='boursier', ine='0A1B2C3D4E5'),
                    candidate(eligibility_result_id='e', situation='AEEH')])
    assert correspondences == {('b', 'PSP-1'): 'exacte', ('e', 'PSP-1'): 'exacte'}


def test_every_lamp01_row_is_listed_for_investigation(pg):
    correspondences, touched, _ = match(
        pg, base=[base_row(id_psp='PSP-1'), base_row(id_psp='PSP-2', prenom='LEA ROSE'),
                  base_row(id_psp='PSP-3', prenom='LEA')],
        candidates=[candidate()])
    assert correspondences == {('c1', 'PSP-1'): 'exacte', ('c1', 'PSP-2'): 'proche',
                               ('c1', 'PSP-3'): 'exacte'}
    assert [row['id_psp'] for row in touched] == ['PSP-1', 'PSP-2', 'PSP-3']
