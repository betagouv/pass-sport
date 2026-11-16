"""End-to-end tests of run_dn.sh and run_dn_doublons.sh: throwaway lamp01, a fake /nfs/run injector and a fake
Démarches Numériques behind a local HTTP server.

Skipped without docker, flock, psql or bash >= 4 (the script's `declare -A`), i.e. anywhere but
a Linux box set up like the lamp.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_run_dn.py
"""

import copy
import csv
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

import mapping
from test_dn_pipeline import DN_ACCOUNT

PIPELINE_DIR = Path(__file__).resolve().parent
SCRIPT = PIPELINE_DIR / 'run_dn.sh'
DOUBLONS_SCRIPT = PIPELINE_DIR / 'run_dn_doublons.sh'
DB_INIT_DIR = PIPELINE_DIR.parents[2] / 'lamp01' / 'db-init'


def champ(label, value, typename='TextChamp', **extra):
    return {'__typename': typename, 'label': label, 'stringValue': value, **extra}


def dossier(number, demandeur, child, beneficiaire_de='', caisse='CAF',
            instruction_event='passe_en_instruction', **overrides):
    """Put en instruction by its own instructeur, I<number>, unless instruction_event says
    otherwise."""
    prenom, nom, genre, birthdate = child
    agent = None if instruction_event.endswith('automatiquement') else f'agent{number}@example.org'
    return {
        'id': f'D{number}', 'number': number, 'state': 'en_instruction',
        'connectionUsager': 'france_connect', 'deposeParUnTiers': False, 'prefilled': False,
        'usager': {'email': f"{demandeur['nom'].lower()}@example.org"},
        'demandeur': {'__typename': 'PersonnePhysique', 'civilite': 'M', 'email': None, **demandeur},
        'labels': [],
        'traitements': [{'event': instruction_event, 'emailAgentTraitant': agent,
                         'dateTraitement': '2026-10-02T09:00:00+02:00'}],
        'groupeInstructeur': {'instructeurs': [{'id': f'I{number}', 'email': f'agent{number}@example.org'}]},
        'champs': [
            champ(mapping.DN_CHAMPS['allocataire_genre'], 'M.'),
            champ(mapping.DN_CHAMPS['adresse'], '1 rue A 69380 Chazay', 'AddressChamp',
                  address={'cityCode': '69052', 'postalCode': '69380', 'cityName': 'Chazay',
                           'streetAddress': '1 rue A'}),
            champ(mapping.DN_CHAMPS['beneficiaire_de'], beneficiaire_de),
            champ(mapping.DN_CHAMPS['caisse'], caisse),
            champ(mapping.DN_CHAMPS['date_naissance'], '', 'DateChamp', date='2006-08-07'),
            champ(mapping.DN_CHAMPS['caisse_enfants'], caisse),
            champ(mapping.DN_CHAMPS['foyer_qf'], 'Oui', 'YesNoChamp'),
            champ(mapping.DN_CHAMPS['enfants_aeeh'], 'Oui', 'YesNoChamp'),
            champ(mapping.DN_CHAMPS['enfants'], '', 'RepetitionChamp', rows=[{'champs': [
                champ(mapping.DN_ENFANT_CHAMPS['aeeh'], 'Oui', 'YesNoChamp'),
                champ(mapping.DN_ENFANT_CHAMPS['genre'], genre),
                champ(mapping.DN_ENFANT_CHAMPS['prenom'], prenom),
                champ(mapping.DN_ENFANT_CHAMPS['nom'], nom),
                champ(mapping.DN_ENFANT_CHAMPS['date_naissance'], '', 'DateChamp', date=birthdate),
            ]}]),
        ],
        'annotations': [{'id': f'A{number}', 'label': mapping.DN_ANNOTATION_CODES, 'stringValue': None},
                        {'id': f'N{number}', 'label': mapping.DN_ANNOTATION_NOTES_CONSTRUCTION, 'stringValue': None}],
        **overrides,
    }


DN_DOSSIERS = [
    # The AAH applicant and their AEEH child, both coded. Pre-filled by the worker.
    dossier(501, {'nom': 'Mervik', 'prenom': 'Tozal'}, ('Ola', 'Mervik', 'Mme', '2016-01-02'),
            beneficiaire_de="L'Allocation aux adultes handicapés (AAH)", prefilled=True),
    # Rejected: unknown gender.
    dossier(502, {'nom': 'Dorvat', 'prenom': 'Tozal'}, ('Pim', 'Dorvat', 'X', '2015-03-12')),
    # Already in lamp01 (seeded by the test), under another situation and caisse: doublon.
    dossier(503, {'nom': 'Ker', 'prenom': 'Ana', 'civilite': 'Mme'}, ('Lio', 'Ker', 'M', '2015-03-12'),
            caisse='MSA'),
    # Still en construction: ignored, but labelled FranceConnect, pre-filled by the worker though
    # claimed with a DN account.
    dossier(504, {'nom': 'Sorel', 'prenom': 'Eli'}, ('Ema', 'Sorel', 'Mme', '2015-03-12'),
            state='en_construction', prefilled=True, connectionUsager=DN_ACCOUNT),
    # Put en instruction by DN itself, no instructeur to answer it as: ignored.
    dossier(505, {'nom': 'Varn', 'prenom': 'Ilo'}, ('Rem', 'Varn', 'M', '2015-03-12'),
            instruction_event='passe_en_instruction_automatiquement'),
    # Neither pre-filled nor filed through FranceConnect: coded, never labelled FranceConnect.
    dossier(506, {'nom': 'Lorn', 'prenom': 'Ade'}, ('Kai', 'Lorn', 'M', '2015-03-12'),
            connectionUsager=DN_ACCOUNT),
]
DN_LABELS = [{'id': f'L-{key}', 'name': name} for key, name in mapping.DN_LABELS.items()]
DN_LABELS.append({'id': 'L-franceconnect', 'name': mapping.DN_LABEL_FRANCECONNECT})
DN_LABELS.append({'id': 'L-doublon-potentiel', 'name': mapping.DN_LABEL_DOUBLON_POTENTIEL})
DN_ANNOTATIONS = [
    {'__typename': mapping.DN_ANNOTATION_TYPE, 'id': 'AD1', 'label': mapping.DN_ANNOTATION_CODES},
    {'__typename': mapping.DN_ANNOTATION_TYPE, 'id': 'AD2', 'label': mapping.DN_ANNOTATION_NOTES_CONSTRUCTION},
]


@pytest.fixture(scope='module')
def lamp():
    for tool in ('docker', 'flock', 'psql'):
        if shutil.which(tool) is None:
            pytest.skip(f'{tool} introuvable')
    bash_major = subprocess.run(['bash', '-c', 'echo ${BASH_VERSINFO[0]}'], capture_output=True,
                                text=True).stdout.strip()
    if int(bash_major or 0) < 4:
        pytest.skip('bash >= 4 requis')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'dn-run-{uuid.uuid4().hex[:8]}'
    started = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=u_passsport',
         '-e', 'POSTGRES_DB=passsport', '-p', '127.0.0.1::5432',
         '-v', f'{DB_INIT_DIR}:/docker-entrypoint-initdb.d:ro', 'postgres:18-alpine'],
        capture_output=True, text=True)
    if started.returncode != 0:
        pytest.skip(f'conteneur postgres impossible à lancer : {started.stderr.strip()}')
    try:
        # Over TCP: the temporary server the image runs while loading db-init only listens on
        # the Unix socket, and answering there is no sign it will not shut down next.
        for _ in range(120):
            ready = subprocess.run(
                ['docker', 'exec', name, 'psql', '-h', '127.0.0.1', '-U', 'u_passsport', '-d', 'passsport',
                 '-Atc', 'select 1 from public.beneficiaires limit 1'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            pytest.fail("le schéma lamp01 ne s'est pas chargé")
        port = subprocess.run(['docker', 'port', name, '5432'], capture_output=True, text=True,
                              check=True).stdout.strip().rsplit(':', 1)[1]
        yield name, port
    finally:
        subprocess.run(['docker', 'stop', name], capture_output=True)


class FakeDn:
    """The démarche, keeping its dossiers' state across the runs of one test."""

    def __init__(self):
        self.dossiers = copy.deepcopy(DN_DOSSIERS)
        self.labels = copy.deepcopy(DN_LABELS)
        self.mutations = []
        self.mutation_times = []
        # Mutations DN answers with an error, as (field, dossier id).
        self.refuse = set()

    def answer(self, body):
        query = body['query']
        if 'labels {' in query and 'dossiers' not in query:
            return {'data': {'demarche': {'labels': self.labels}}}
        if 'annotationDescriptors' in query:
            return {'data': {'demarche': {'activeRevision': {'annotationDescriptors': DN_ANNOTATIONS}}}}
        if 'dossiers(' in query:
            nodes = [d for d in self.dossiers if d['state'] == body['variables']['state']]
            return {'data': {'demarche': {'dossiers': {
                'pageInfo': {'hasNextPage': False, 'endCursor': None}, 'nodes': nodes}}}}
        field = query.split('(input')[0].split('{', 1)[1].strip()
        payload = body['variables']['input']
        if (field, payload['dossierId']) in self.refuse:
            return {'data': {field: {'errors': [{'message': 'refusé'}]}}}
        self.mutations.append((field, payload))
        self.mutation_times.append(time.monotonic())
        dossier = next(d for d in self.dossiers if d['id'] == payload['dossierId'])
        if field == 'dossierAjouterLabel':
            dossier['labels'].append(next(label for label in self.labels if label['id'] == payload['labelId']))
        if field == 'dossierAccepter':
            dossier['state'] = 'accepte'
        if field == 'dossierModifierAnnotations':
            written = payload['annotations'][0]
            next(a for a in dossier['annotations'] if a['id'] == written['id'])['stringValue'] = written['value']['textarea']
        return {'data': {field: {'errors': None, 'message': {'id': 'M'}, 'label': {'id': 'L'},
                                 'dossier': {'id': dossier['id'], 'state': dossier['state']}}}}

    def calls(self):
        """(mutation, dossier id, label id when one is added), in order."""
        return [(field, payload['dossierId'], payload.get('labelId')) for field, payload in self.mutations]


class FakeInjector:
    """Production's /nfs/run injector: files each drop, next to its log, in succes/<name>/
    (mode 'succes') or failed/<name>/ (mode 'failed'), or leaves it alone (mode 'off')."""

    def __init__(self, drop: Path):
        self.drop = drop
        self.mode = 'succes'
        self.injected_at = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        while not self._stop.wait(0.2):
            if self.mode == 'off':
                continue
            for path in sorted(self.drop.glob('beneficiaires-insertion-*.csv')):
                filed = self.drop / self.mode / path.stem
                filed.mkdir(parents=True)
                path.rename(filed / path.name)
                (filed / f'{path.stem}.log').write_text('')
                if self.mode == 'succes':
                    self.injected_at = time.monotonic()

    def stop(self):
        self._stop.set()
        self._thread.join()


@pytest.fixture
def dn():
    state = FakeDn()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            raw = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode()
            payload = state.answer(json.loads(raw))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state.url = f'http://127.0.0.1:{server.server_port}/graphql'
    yield state
    server.shutdown()


@pytest.fixture
def injector(tmp_path):
    (tmp_path / 'drop').mkdir()
    fake = FakeInjector(tmp_path / 'drop')
    yield fake
    fake.stop()


@pytest.fixture
def workspace(tmp_path, lamp, dn, injector):
    name, port = lamp

    def psql(sql):
        return subprocess.run(['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport',
                               '-Atc', sql], capture_output=True, text=True, check=True).stdout.strip()

    psql('truncate public.beneficiaire_cnaf_extra_field, public.beneficiaires')
    psql("insert into public.beneficiaires (id_psp, nom, prenom, date_naissance, genre, organisme, "
         "situation, allocataire_qualite, allocataire_nom, allocataire_prenom, exercice_id) values "
         "('26-KNWN-0001', 'KER', 'LIO', '2015-03-12 04:00', 'M', 'CAF', 'jeune', 'M', 'KER', 'ANA', 5)")
    (tmp_path / 'codes.csv').write_text('code\n26-KNWN-0001\n')

    env = {
        **os.environ,
        'LAMP_DB_HOST': '127.0.0.1', 'LAMP_DB_PORT': port, 'LAMP_DB_USER': 'u_passsport',
        'LAMP_DB_NAME': 'passsport', 'LAMP_DB_PASSWORD': 'test',
        'EXISTING_CODES_PATHFILE_2026': str(tmp_path / 'codes.csv'),
        'FC_PROD_DROP_DIR': str(tmp_path / 'drop'),
        'FC_LOCK_FILE': str(tmp_path / 'lock'),
        'DN_RUN_DIR': str(tmp_path / 'run'),
        'DN_API_URL': dn.url, 'DN_API_TOKEN': 't', 'DN_DEMARCHE_NUMBER': '1234',
        'DN_ATTENTE_PROD_MIN': '1', 'DN_ATTENTE_PAS_S': '1',
    }

    def run(*args, script=SCRIPT, **extra_env):
        # Run directories are named to the second.
        time.sleep(1)
        return subprocess.run([str(script), *args], env={**env, **extra_env}, capture_output=True, text=True)

    return tmp_path, run, psql


def sha1(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


# Right after the DN read, before any code: the deposited dossiers the worker pre-filled or
# filed through FranceConnect, D506 excepted.
LABELLED_FC = [('dossierAjouterLabel', f'D{number}', 'L-franceconnect') for number in (501, 502, 503, 504, 505)]

ANSWERED = [
    ('dossierModifierAnnotations', 'D501', None), ('dossierEnvoyerMessage', 'D501', None),
    ('dossierAjouterLabel', 'D501', 'L-traite'), ('dossierAccepter', 'D501', None),
    ('dossierEnvoyerMessage', 'D502', None), ('dossierAjouterLabel', 'D502', 'L-rejete'),
    ('dossierModifierAnnotations', 'D503', None), ('dossierEnvoyerMessage', 'D503', None),
    ('dossierAjouterLabel', 'D503', 'L-traite'),
    ('dossierAjouterLabel', 'D503', 'L-doublon'), ('dossierAccepter', 'D503', None),
    ('dossierModifierAnnotations', 'D506', None), ('dossierEnvoyerMessage', 'D506', None),
    ('dossierAjouterLabel', 'D506', 'L-traite'), ('dossierAccepter', 'D506', None),
]


def test_dry_run_reads_dn_and_writes_nothing(workspace, dn):
    tmp_path, run, psql = workspace
    codes_before = sha1(tmp_path / 'codes.csv')

    result = run('--dry-run')

    assert result.returncode == 0, result.stdout + result.stderr
    assert sha1(tmp_path / 'codes.csv') == codes_before
    assert list((tmp_path / 'drop').iterdir()) == []
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert dn.mutations == []

    run_dir = (tmp_path / 'run' / 'latest').resolve()
    assert run_dir.name.endswith('-dry-run')
    assert (run_dir / 'retours.csv').read_text().count(';simule;') == len(ANSWERED)
    assert (run_dir / 'label-franceconnect.csv').read_text().count(';simule;') == len(LABELLED_FC)
    assert not (tmp_path / 'run' / 'a-reprendre').exists()


def test_real_run_answers_the_dossiers_only_once_the_injector_filed_the_drop_in_succes(workspace, dn, injector):
    tmp_path, run, psql = workspace

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert psql('select count(*) from public.beneficiaires') == '4'
    injected, = (tmp_path / 'drop' / 'succes').glob('*/beneficiaires-insertion-3-*.csv')
    with injected.open(encoding='utf-8', newline='') as handle:
        injected_codes = {row['id_psp'] for row in csv.DictReader(handle, delimiter=';')}
    assert injector.injected_at < min(dn.mutation_times[len(LABELLED_FC):])
    assert dn.calls() == LABELLED_FC + ANSWERED
    # Each dossier answered as the instructeur who put it en instruction.
    assert all(payload['instructeurId'] == payload['dossierId'].replace('D', 'I')
               for field, payload in dn.mutations if field != 'dossierAjouterLabel')
    annotation = dict(line.split(' : ') for line in dn.dossiers[0]['annotations'][0]['stringValue'].splitlines())
    assert sorted(annotation) == ['Ola Mervik', 'Tozal Mervik']
    without_fc = dict(line.split(' : ') for line in dn.dossiers[5]['annotations'][0]['stringValue'].splitlines())
    assert sorted(without_fc) == ['Kai Lorn']
    assert {*annotation.values(), *without_fc.values()} == injected_codes
    message = dn.mutations[len(LABELLED_FC) + 1][1]['body']
    assert all(code in message for code in annotation.values())
    # The doublon's code comes from lamp01: never handed out, only noted for the support.
    assert all('26-KNWN-0001' not in json.dumps(payload) for field, payload in dn.mutations
               if field != 'dossierModifierAnnotations')
    doublon_annotation, = (dossier['annotations'][0]['stringValue'] for dossier in dn.dossiers
                           if dossier['id'] == 'D503')
    assert 'Code existant : 26-KNWN-0001' in doublon_annotation
    assert 'Vérification manuelle du support requise' in doublon_annotation
    investigation = (tmp_path / 'run' / 'latest' / 'investigation.csv').read_text()
    assert '26-KNWN-0001' in investigation

    rerun = run()

    assert rerun.returncode == 0, rerun.stdout + rerun.stderr
    assert 'rien-a-faire' in (tmp_path / 'run' / 'latest' / 'STATUT').read_text()
    assert len(dn.mutations) == len(LABELLED_FC) + len(ANSWERED)


def test_a_run_stopped_after_lamp01_blocks_the_next_ones_until_resumed(workspace, dn):
    tmp_path, run, psql = workspace
    dn.refuse.add(('dossierAccepter', 'D501'))

    failed = run()

    assert failed.returncode != 0
    marker = tmp_path / 'run' / 'a-reprendre'
    run_dir = marker.read_text().strip()
    # Production and lamp01 already hold the codes: the resume neither waits nor injects again.
    assert (Path(run_dir) / 'en-production').exists()
    assert psql('select count(*) from public.beneficiaires') == '4'
    # The refused acceptance leaves its dossier labelled Traité but en instruction; the other
    # dossiers are answered.
    assert dn.calls() == LABELLED_FC + [call for call in ANSWERED if call != ('dossierAccepter', 'D501', None)]
    assert dn.dossiers[0]['state'] == 'en_instruction'

    blocked = run()
    assert blocked.returncode != 0
    assert 'inachevé' in blocked.stdout + blocked.stderr

    dn.refuse.clear()
    resumed = run('--reprendre', run_dir)

    assert resumed.returncode == 0, resumed.stdout + resumed.stderr
    assert not marker.exists()
    assert psql('select count(*) from public.beneficiaires') == '4'
    assert dn.calls()[len(LABELLED_FC) + len(ANSWERED) - 1:] == [('dossierAccepter', 'D501', None)]
    assert dn.dossiers[0]['state'] == 'accepte'
    assert len(list((tmp_path / 'drop' / 'succes').glob('*/beneficiaires-insertion-*.csv'))) == 1


def test_a_drop_refused_by_production_is_never_replayed(workspace, dn, injector):
    tmp_path, run, psql = workspace
    injector.mode = 'failed'

    refused = run()

    assert refused.returncode != 0
    assert 'refusé par la production' in refused.stdout + refused.stderr
    # lamp01 never got the codes, the coded dossier hears nothing: its label only.
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert dn.calls() == LABELLED_FC + [
        ('dossierAjouterLabel', 'D501', 'L-a_verifier'),
        ('dossierEnvoyerMessage', 'D502', None), ('dossierAjouterLabel', 'D502', 'L-rejete'),
        ('dossierModifierAnnotations', 'D503', None), ('dossierEnvoyerMessage', 'D503', None),
        ('dossierAjouterLabel', 'D503', 'L-traite'),
        ('dossierAjouterLabel', 'D503', 'L-doublon'), ('dossierAccepter', 'D503', None),
        ('dossierAjouterLabel', 'D506', 'L-a_verifier'),
    ]
    assert not (tmp_path / 'run' / 'a-reprendre').exists()

    injector.mode = 'succes'
    rerun = run()

    assert rerun.returncode == 0, rerun.stdout + rerun.stderr
    assert 'rien-a-faire' in (tmp_path / 'run' / 'latest' / 'STATUT').read_text()


def test_a_pending_drop_postpones_the_run(workspace, dn, injector):
    tmp_path, run, psql = workspace
    injector.mode = 'off'
    (tmp_path / 'drop' / 'beneficiaires-insertion-1-2026-01-01T00-00-00.csv').write_text('x')

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'reporte' in (tmp_path / 'run' / 'passages.log').read_text()
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert dn.mutations == []


def test_a_demarche_without_the_franceconnect_label_still_codes_and_answers(workspace, dn):
    tmp_path, run, psql = workspace
    dn.labels = [label for label in dn.labels if label['id'] != 'L-franceconnect']

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'ATTENTION : label « FranceConnect » pas posé partout' in result.stdout
    assert dn.calls() == ANSWERED


# --- run_dn_doublons.sh -----------------------------------------------------------------

DOUBLON_LINE = 'Doublon potentiel pour Ema Sorel 12/03/2015 : 26-EMAS-0001'
ANNOTATE_504 = ('dossierModifierAnnotations', 'D504', None)
LABEL_504 = ('dossierAjouterLabel', 'D504', 'L-doublon-potentiel')


@pytest.fixture
def known_504(workspace, dn):
    """D504, en construction, is followed by an instructeur and lamp01 knows its child."""
    _, _, psql = workspace
    dn.dossiers[3]['instructeurs'] = [{'id': 'I504', 'email': 'agent504@example.org'}]
    psql("insert into public.beneficiaires (id_psp, nom, prenom, date_naissance, genre, organisme, "
         "situation, allocataire_qualite, allocataire_nom, allocataire_prenom, exercice_id) values "
         "('26-EMAS-0001', 'SOREL', 'EMA', '2015-03-12 04:00', 'F', 'CAF', 'jeune', 'M', 'SOREL', 'ELI', 5)")
    return dn.dossiers[3]


def notes_of(dossier_504):
    return dossier_504['annotations'][1]['stringValue']


def doublons_files(tmp_path):
    return sorted(path.name for path in (tmp_path / 'run' / 'doublons').rglob('*') if path.is_file())


def test_doublons_annotates_labels_then_waits_for_the_label_to_be_removed(workspace, dn, known_504):
    _, run, psql = workspace

    first = run(script=DOUBLONS_SCRIPT)

    assert first.returncode == 0, first.stdout + first.stderr
    assert dn.calls() == [ANNOTATE_504, LABEL_504]
    assert notes_of(known_504) == DOUBLON_LINE
    assert dn.mutations[0][1]['instructeurId'] == 'I504'

    run(script=DOUBLONS_SCRIPT)
    assert dn.calls() == [ANNOTATE_504, LABEL_504]

    known_504['labels'] = []
    run(script=DOUBLONS_SCRIPT)
    assert dn.calls()[2:] == [LABEL_504]

    known_504['labels'] = []
    psql("delete from public.beneficiaires where id_psp = '26-EMAS-0001'")
    run(script=DOUBLONS_SCRIPT)
    assert dn.calls()[3:] == [ANNOTATE_504]
    assert notes_of(known_504) == ''


def test_doublons_ignores_a_dossier_no_instructeur_follows(workspace, dn, known_504):
    _, run, _ = workspace
    known_504['instructeurs'] = []

    result = run(script=DOUBLONS_SCRIPT)

    assert result.returncode == 0, result.stdout + result.stderr
    assert dn.mutations == []


def test_doublons_dry_run_writes_nothing_and_shows_the_text(workspace, dn, known_504):
    tmp_path, run, _ = workspace

    result = run('--dry-run', script=DOUBLONS_SCRIPT)

    assert result.returncode == 0, result.stdout + result.stderr
    assert dn.mutations == []
    journal, = (tmp_path / 'run' / 'doublons').glob('*-dry-run/doublons.csv')
    assert DOUBLON_LINE in journal.read_text(encoding='utf-8')


def test_doublons_keeps_no_identity_after_a_real_run(workspace, dn, known_504):
    tmp_path, run, _ = workspace
    (tmp_path / 'tmp').mkdir()

    result = run(script=DOUBLONS_SCRIPT, TMPDIR=str(tmp_path / 'tmp'))

    assert result.returncode == 0, result.stdout + result.stderr
    assert doublons_files(tmp_path) == ['doublons.csv', 'passages.log', 'run.log', 'verrou']
    assert list((tmp_path / 'tmp').iterdir()) == []
    for path in (tmp_path / 'run' / 'doublons').rglob('*'):
        if path.is_file():
            assert 'Sorel' not in path.read_text(encoding='utf-8')


def test_doublons_leaves_no_candidate_file_when_lamp01_refuses(workspace, dn, known_504):
    tmp_path, run, _ = workspace
    (tmp_path / 'tmp').mkdir()

    result = run(script=DOUBLONS_SCRIPT, LAMP_DB_PASSWORD='mauvais', TMPDIR=str(tmp_path / 'tmp'))

    assert result.returncode != 0
    assert dn.mutations == []
    assert list((tmp_path / 'tmp').iterdir()) == []
    assert ' echec ' in (tmp_path / 'run' / 'doublons' / 'passages.log').read_text(encoding='utf-8')


def test_doublons_skips_while_a_previous_run_holds_its_lock(workspace, dn, known_504):
    tmp_path, run, _ = workspace
    work_dir = tmp_path / 'run' / 'doublons'
    work_dir.mkdir(parents=True)

    with (work_dir / 'verrou').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        result = run(script=DOUBLONS_SCRIPT)

    assert result.returncode == 0, result.stdout + result.stderr
    assert dn.mutations == []
    assert 'ignore-verrou' in (work_dir / 'passages.log').read_text(encoding='utf-8')
