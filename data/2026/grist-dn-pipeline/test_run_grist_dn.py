"""End-to-end tests of run_grist_dn.sh: throwaway lamp01, a fake /nfs/run injector, fake Grist,
fake Démarches Numériques and fake Link Mobility behind one local HTTP server.

Skipped without docker, pnpm, flock or bash >= 4 (the script's `declare -A`), i.e. anywhere
but a Linux box set up like the lamp.

Run from data/ : source .venv/bin/activate && pytest 2026/grist-dn-pipeline/test_run_grist_dn.py
"""

import copy
import csv
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
from urllib.parse import parse_qs

import pytest

import mapping

PIPELINE_DIR = Path(__file__).resolve().parent
SCRIPT = PIPELINE_DIR / 'run_grist_dn.sh'
DB_INIT_DIR = PIPELINE_DIR.parents[2] / 'lamp01' / 'db-init'

GRIST_ROWS = [
    # AEEH child, coded.
    {'id': 1, 'fields': {
        'Caisse': 'CAF', 'Genre': 'F', 'Prenom': 'Élyra', 'Nom': 'Quistane',
        'Date': 1426118400, 'Situation': 'AEEH', 'Genre_allocataire': 'M',
        'Prenom_parent': 'Tozal', 'Nom_parent': 'Quistane', 'Matricule': '1234567',
        'Email': 'tozal@example.org', 'Code_INSEE': '01053', 'Eligibilite': 'Oui',
        'Commentaire': '', 'Statut': None, 'Motif': None}},
    # Rejected: unknown gender.
    {'id': 2, 'fields': {
        'Caisse': 'CAF', 'Genre': 'X', 'Prenom': 'Pim', 'Nom': 'Dorvat', 'Date': 1426118400,
        'Situation': 'AEEH', 'Genre_allocataire': 'M', 'Prenom_parent': 'Tozal',
        'Nom_parent': 'Dorvat', 'Matricule': '', 'Email': 'pim@example.org', 'Code_INSEE': '',
        'Eligibilite': 'Oui', 'Commentaire': '', 'Statut': None, 'Motif': None}},
    # Already in lamp01 (seeded by the test): doublon.
    {'id': 3, 'fields': {
        'Caisse': 'MSA', 'Genre': 'M', 'Prenom': 'Lio', 'Nom': 'Ker', 'Date': 1426118400,
        'Situation': 'AEEH', 'Genre_allocataire': 'Mme', 'Prenom_parent': 'Ana',
        'Nom_parent': 'Ker', 'Matricule': '', 'Email': 'ana@example.org', 'Code_INSEE': '',
        'Eligibilite': 'Oui', 'Commentaire': '', 'Statut': None, 'Motif': None}},
    # Not marked eligible: ignored.
    {'id': 4, 'fields': {'Eligibilite': 'Non', 'Statut': None}},
]
GRIST_COLUMN_IDS = {
    'caisse': 'Caisse', 'genre': 'Genre', 'prenom': 'Prenom', 'nom': 'Nom', 'date_naissance': 'Date',
    'situation': 'Situation', 'allocataire_genre': 'Genre_allocataire',
    'allocataire_prenom': 'Prenom_parent', 'allocataire_nom': 'Nom_parent',
    'matricule': 'Matricule', 'email': 'Email', 'code_insee': 'Code_INSEE',
    'eligibilite': 'Eligibilite', 'commentaire': 'Commentaire', 'statut': 'Statut',
}


def champ(label, value, typename='TextChamp', **extra):
    return {'__typename': typename, 'label': label, 'stringValue': value, **extra}


DN_DOSSIER = {
    'id': 'D1', 'number': 501, 'state': 'en_instruction', 'connectionUsager': 'france_connect',
    'deposeParUnTiers': False,
    'usager': {'email': 'mervik@example.org'},
    'demandeur': {'__typename': 'PersonnePhysique', 'civilite': 'M', 'nom': 'Mervik',
                  'prenom': 'Tozal', 'email': None},
    'labels': [],
    'champs': [
        champ(mapping.DN_CHAMPS['allocataire_genre'], 'M.'),
        champ(mapping.DN_CHAMPS['adresse'], '1 rue A 69380 Chazay', 'AddressChamp',
              address={'cityCode': '69052', 'postalCode': '69380', 'cityName': 'Chazay',
                       'streetAddress': '1 rue A'}),
        champ(mapping.DN_CHAMPS['beneficiaire_de'], "L'Allocation aux adultes handicapés (AAH)"),
        champ(mapping.DN_CHAMPS['foyer_qf_aeeh'], 'Oui', 'YesNoChamp'),
        champ(mapping.DN_CHAMPS['caisse'], 'CAF'),
        champ(mapping.DN_CHAMPS['date_naissance'], '', 'DateChamp', date='2006-08-07'),
        champ(mapping.DN_CHAMPS['enfants'], '', 'RepetitionChamp', rows=[{'champs': [
            champ(mapping.DN_ENFANT_CHAMPS['aeeh'], 'Oui', 'YesNoChamp'),
            champ(mapping.DN_ENFANT_CHAMPS['genre'], 'Mme'),
            champ(mapping.DN_ENFANT_CHAMPS['prenom'], 'Ola'),
            champ(mapping.DN_ENFANT_CHAMPS['nom'], 'Mervik'),
            champ(mapping.DN_ENFANT_CHAMPS['date_naissance'], '', 'DateChamp', date='2016-01-02'),
        ]}]),
    ],
    'annotations': [{'id': 'A1', 'label': mapping.DN_ANNOTATION_CODES, 'stringValue': None}],
}
DN_LABELS = [{'id': f'L-{key}', 'name': name} for key, name in mapping.DN_LABELS.items()]
DN_ANNOTATIONS = [{'__typename': mapping.DN_ANNOTATION_TYPE, 'id': 'AD1', 'label': mapping.DN_ANNOTATION_CODES}]

TEMPLATES = {'LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH': '1006',
             'LINK_MOBILITY_TEMPLATE_CODE_DIRECT_BOURSIER': '1007',
             'LINK_MOBILITY_TEMPLATE_CODE_INDIRECT': '1008'}


@pytest.fixture(scope='module')
def lamp():
    for tool in ('docker', 'pnpm', 'flock', 'psql'):
        if shutil.which(tool) is None:
            pytest.skip(f'{tool} introuvable')
    bash_major = subprocess.run(['bash', '-c', 'echo ${BASH_VERSINFO[0]}'], capture_output=True,
                                text=True).stdout.strip()
    if int(bash_major or 0) < 4:
        pytest.skip('bash >= 4 requis')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'grist-dn-{uuid.uuid4().hex[:8]}'
    started = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=u_passsport',
         '-e', 'POSTGRES_DB=passsport', '-p', '127.0.0.1::5432',
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
        port = subprocess.run(['docker', 'port', name, '5432'], capture_output=True, text=True,
                              check=True).stdout.strip().rsplit(':', 1)[1]
        yield name, port
    finally:
        subprocess.run(['docker', 'stop', name], capture_output=True)


class FakeApis:
    """Grist, DN and Link Mobility, each keeping its state across the runs of one test."""

    def __init__(self):
        self.grist_rows = copy.deepcopy(GRIST_ROWS)
        self.dossiers = [copy.deepcopy(DN_DOSSIER)]
        self.grist_patches = []
        self.dn_mutations = []
        self.mails = []
        self.mail_times = []
        self.refuse_mails = False

    def grist(self, method, path, body):
        if path.endswith('/columns'):
            labels = dict(mapping.GRIST_COLUMNS, motif='Motif')
            ids = dict(GRIST_COLUMN_IDS, motif='Motif')
            return {'columns': [{'id': ids[key], 'fields': {'label': label}}
                                for key, label in labels.items()]}
        if method == 'GET':
            return {'records': self.grist_rows}
        self.grist_patches.extend(body['records'])
        for update in body['records']:
            next(row for row in self.grist_rows if row['id'] == update['id'])['fields'].update(
                update['fields'])
        return {}

    def dn(self, body):
        query = body['query']
        if 'labels {' in query and 'dossiers' not in query:
            return {'data': {'demarche': {'labels': DN_LABELS}}}
        if 'annotationDescriptors' in query:
            return {'data': {'demarche': {'activeRevision': {'annotationDescriptors': DN_ANNOTATIONS}}}}
        if 'dossiers(' in query:
            nodes = [d for d in self.dossiers if d['state'] == body['variables']['state']]
            return {'data': {'demarche': {'dossiers': {
                'pageInfo': {'hasNextPage': False, 'endCursor': None}, 'nodes': nodes}}}}
        field = query.split('(input')[0].split('{', 1)[1].strip()
        payload = body['variables']['input']
        self.dn_mutations.append((field, payload))
        dossier = next(d for d in self.dossiers if d['id'] == payload['dossierId'])
        if field == 'dossierAjouterLabel':
            dossier['labels'].append(next(label for label in DN_LABELS if label['id'] == payload['labelId']))
        if field == 'dossierAccepter':
            dossier['state'] = 'accepte'
        if field == 'dossierModifierAnnotations':
            dossier['annotations'][0]['stringValue'] = payload['annotations'][0]['value']['textarea']
        return {'data': {field: {'errors': None, 'message': {'id': 'M'}, 'label': {'id': 'L'},
                                 'dossier': {'id': dossier['id'], 'state': dossier['state']}}}}

    def link_mobility(self, form):
        if self.refuse_mails:
            return {'resultat': 0, 'erreurs': '2'}
        self.mails.append(form)
        self.mail_times.append(time.monotonic())
        return {'resultat': 1, 'id': 7}


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
def apis():
    state = FakeApis()

    class Handler(BaseHTTPRequestHandler):
        def _answer(self):
            raw = self.rfile.read(int(self.headers.get('Content-Length') or 0)).decode()
            if self.path.startswith('/grist'):
                payload = state.grist(self.command, self.path, json.loads(raw) if raw else None)
            elif self.path.startswith('/dn'):
                payload = state.dn(json.loads(raw))
            else:
                payload = state.link_mobility(parse_qs(raw))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

        do_GET = do_POST = do_PATCH = _answer

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    state.url = f'http://127.0.0.1:{server.server_port}'
    yield state
    server.shutdown()


@pytest.fixture
def injector(tmp_path):
    (tmp_path / 'drop').mkdir()
    fake = FakeInjector(tmp_path / 'drop')
    yield fake
    fake.stop()


@pytest.fixture
def workspace(tmp_path, lamp, apis, injector):
    name, port = lamp

    def psql(sql):
        return subprocess.run(['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport',
                               '-Atc', sql], capture_output=True, text=True, check=True).stdout.strip()

    psql('truncate public.beneficiaire_cnaf_extra_field, public.beneficiaires')
    psql("insert into public.beneficiaires (id_psp, nom, prenom, date_naissance, genre, organisme, "
         "situation, exercice_id) values ('26-KNWN-0001', 'KER', 'LIO', '2015-03-12 04:00', 'M', "
         "'CAF', 'jeune', 5)")
    (tmp_path / 'codes.csv').write_text('code\n26-KNWN-0001\n')

    env = {
        **os.environ, **TEMPLATES,
        'LAMP_DB_HOST': '127.0.0.1', 'LAMP_DB_PORT': port, 'LAMP_DB_USER': 'u_passsport',
        'LAMP_DB_NAME': 'passsport', 'LAMP_DB_PASSWORD': 'test',
        'EXISTING_CODES_PATHFILE_2026': str(tmp_path / 'codes.csv'),
        'FC_PROD_DROP_DIR': str(tmp_path / 'drop'),
        'FC_LOCK_FILE': str(tmp_path / 'lock'),
        'GRIST_DN_RUN_DIR': str(tmp_path / 'run'),
        'GRIST_API_URL': f'{apis.url}/grist/api', 'GRIST_API_KEY': 'k', 'GRIST_DOC_ID': 'doc',
        'GRIST_TABLE_ID': 'T', 'GRIST_COLONNE_MOTIF': 'Motif',
        'DN_API_URL': f'{apis.url}/dn/graphql', 'DN_API_TOKEN': 't', 'DN_DEMARCHE_NUMBER': '1234',
        'DN_INSTRUCTEUR_ID': 'I1',
        'LINK_MOBILITY_API_URL': f'{apis.url}/lm', 'LINK_MOBILITY_API_KEY': 'fake',
        'GRIST_DN_ATTENTE_PROD_MIN': '1', 'GRIST_DN_ATTENTE_PAS_S': '1',
    }

    def run(*args):
        # Run directories are named to the second.
        time.sleep(1)
        return subprocess.run([str(SCRIPT), *args], env=env, capture_output=True, text=True)

    return tmp_path, run, psql


def sha1(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def statuts(apis):
    return {row['id']: row['fields'].get('Statut') for row in apis.grist_rows}


def test_dry_run_reads_the_apis_and_writes_nothing(workspace, apis):
    tmp_path, run, psql = workspace
    codes_before = sha1(tmp_path / 'codes.csv')

    result = run('--dry-run')

    assert result.returncode == 0, result.stdout + result.stderr
    assert sha1(tmp_path / 'codes.csv') == codes_before
    assert list((tmp_path / 'drop').iterdir()) == []
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert (apis.grist_patches, apis.dn_mutations, apis.mails) == ([], [], [])

    run_dir = (tmp_path / 'run' / 'latest').resolve()
    assert run_dir.name.endswith('-dry-run')
    assert (run_dir / 'envois.csv').read_text().count(';simule;') == 3
    # 3 Grist rows; the DN dossier's codes annotation, message, label and acceptance.
    assert (run_dir / 'retours.csv').read_text().count(';simule;') == 7
    assert not (tmp_path / 'run' / 'a-reprendre').exists()


def test_real_run_reports_back_only_once_the_injector_filed_the_drop_in_succes(workspace, apis, injector):
    tmp_path, run, psql = workspace

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert psql('select count(*) from public.beneficiaires') == '4'
    injected, = (tmp_path / 'drop' / 'succes').glob('*/beneficiaires-insertion-3-*.csv')
    with injected.open(encoding='utf-8', newline='') as handle:
        injected_codes = {row['id_psp'] for row in csv.DictReader(handle, delimiter=';')}
    assert injector.injected_at < min(apis.mail_times)
    assert sorted(mail['message'][0] for mail in apis.mails) == ['1006', '1008', '1008']
    assert statuts(apis) == {1: 'Code envoyé', 2: 'Rejeté', 3: 'Doublon', 4: None}
    assert [field for field, _ in apis.dn_mutations] == [
        'dossierModifierAnnotations', 'dossierEnvoyerMessage', 'dossierAjouterLabel', 'dossierAccepter']
    annotation = dict(line.split(' : ') for line in apis.dossiers[0]['annotations'][0]['stringValue'].splitlines())
    assert sorted(annotation) == ['Ola Mervik', 'Tozal Mervik']
    assert set(annotation.values()) <= injected_codes
    message = apis.dn_mutations[1][1]['body']
    assert all(code in message for code in annotation.values())
    investigation = (tmp_path / 'run' / 'latest' / 'investigation.csv').read_text()
    assert '26-KNWN-0001' in investigation

    rerun = run()

    assert rerun.returncode == 0, rerun.stdout + rerun.stderr
    assert 'rien-a-faire' in (tmp_path / 'run' / 'latest' / 'STATUT').read_text()
    assert len(apis.mails) == 3


def test_a_run_stopped_after_lamp01_blocks_the_next_ones_until_resumed(workspace, apis):
    tmp_path, run, psql = workspace
    apis.refuse_mails = True

    failed = run()

    assert failed.returncode != 0
    marker = tmp_path / 'run' / 'a-reprendre'
    run_dir = marker.read_text().strip()
    # Production and lamp01 already hold the codes: the resume neither waits nor injects again.
    assert (Path(run_dir) / 'en-production').exists()
    assert psql('select count(*) from public.beneficiaires') == '4'
    # The rows whose mail did not leave stay untouched; the others are reported.
    assert statuts(apis) == {1: None, 2: 'Rejeté', 3: 'Doublon', 4: None}
    assert apis.dn_mutations == []

    blocked = run()
    assert blocked.returncode != 0
    assert 'inachevé' in blocked.stdout + blocked.stderr

    apis.refuse_mails = False
    resumed = run('--reprendre', run_dir)

    assert resumed.returncode == 0, resumed.stdout + resumed.stderr
    assert not marker.exists()
    assert psql('select count(*) from public.beneficiaires') == '4'
    assert len(apis.mails) == 3
    assert statuts(apis)[1] == 'Code envoyé'
    assert [field for field, _ in apis.dn_mutations][-1] == 'dossierAccepter'
    assert len(list((tmp_path / 'drop' / 'succes').glob('*/beneficiaires-insertion-*.csv'))) == 1


def test_a_drop_refused_by_production_is_never_replayed(workspace, apis, injector):
    tmp_path, run, psql = workspace
    injector.mode = 'failed'

    refused = run()

    assert refused.returncode != 0
    assert 'refusé par la production' in refused.stdout + refused.stderr
    # lamp01 never got the codes, nobody was mailed.
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert apis.mails == []
    assert statuts(apis) == {1: 'Rejeté', 2: 'Rejeté', 3: 'Doublon', 4: None}
    assert "refusé par l'injecteur de production" in apis.grist_rows[0]['fields']['Motif']
    assert [(field, payload.get('labelId')) for field, payload in apis.dn_mutations] == [
        ('dossierAjouterLabel', 'L-a_verifier')]
    assert not (tmp_path / 'run' / 'a-reprendre').exists()

    injector.mode = 'succes'
    rerun = run()

    assert rerun.returncode == 0, rerun.stdout + rerun.stderr
    assert 'rien-a-faire' in (tmp_path / 'run' / 'latest' / 'STATUT').read_text()
    assert apis.mails == []


def test_a_pending_drop_postpones_the_run(workspace, apis, injector):
    tmp_path, run, psql = workspace
    injector.mode = 'off'
    (tmp_path / 'drop' / 'beneficiaires-insertion-1-2026-01-01T00-00-00.csv').write_text('x')

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert 'reporte' in (tmp_path / 'run' / 'passages.log').read_text()
    assert psql('select count(*) from public.beneficiaires') == '1'
    assert (apis.grist_patches, apis.mails) == ([], [])
