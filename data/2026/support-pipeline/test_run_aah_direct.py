"""End-to-end tests of run_aah_direct.sh against a throwaway lamp01 and a fake Link Mobility.

Skipped without docker or pnpm (the mail step runs the worker's `pnpm codes:aah-emails`).

Run from data/ : source .venv/bin/activate && pytest 2026/support-pipeline/test_run_aah_direct.py
"""

import hashlib
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

SUPPORT_DIR = Path(__file__).resolve().parent
SCRIPT = SUPPORT_DIR / 'run_aah_direct.sh'
DB_INIT_DIR = SUPPORT_DIR.parents[2] / 'lamp01' / 'db-init'

INPUT = (
    "genre;Prénom;Nom;Date de naissance;email;Critère d'éligibilité\n"
    'M ; Tozal ; MERVIK ; 07/08/2006; tozal@example.org ; aah\n'
    'F ; Élyra ; Quistane ; 01/02/2004; elyra@example.org ; aah\n'
    'X ; Pim ; Dorvat ; 07/08/2006; pim@example.org ; aah\n'
)


@pytest.fixture(scope='module')
def lamp_port():
    if shutil.which('docker') is None or shutil.which('pnpm') is None:
        pytest.skip('docker ou pnpm introuvable')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'aah-direct-{uuid.uuid4().hex[:8]}'
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


@pytest.fixture(scope='module')
def link_mobility():
    """Accepts every mail and keeps the decoded form bodies."""
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers['Content-Length'])).decode()
            received.append(parse_qs(body))
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"resultat": 1, "id": 7}')

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{server.server_port}', received
    server.shutdown()


@pytest.fixture
def workspace(tmp_path, lamp_port, link_mobility):
    name, port = lamp_port
    url, received = link_mobility
    subprocess.run(['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport', '-c',
                    'truncate public.beneficiaire_cnaf_extra_field, public.beneficiaires'],
                   capture_output=True, check=True)
    received.clear()

    (tmp_path / 'drop').mkdir()
    (tmp_path / 'codes.csv').write_text('code\n')
    (tmp_path / 'entree.csv').write_text(INPUT)

    env = {
        **os.environ,
        'LAMP_DB_HOST': '127.0.0.1', 'LAMP_DB_PORT': port, 'LAMP_DB_USER': 'u_passsport',
        'LAMP_DB_NAME': 'passsport', 'LAMP_DB_PASSWORD': 'test',
        'EXISTING_CODES_PATHFILE_2026': str(tmp_path / 'codes.csv'),
        'FC_PROD_DROP_DIR': str(tmp_path / 'drop'),
        'FC_LOCK_FILE': str(tmp_path / 'lock'),
        'AAH_RUN_DIR': str(tmp_path / 'run'),
        'LINK_MOBILITY_API_URL': url,
        'LINK_MOBILITY_API_KEY': 'fake',
        'LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH': '1006',
    }

    def run(*args):
        # Run directories are named to the second.
        time.sleep(1)
        return subprocess.run([str(SCRIPT), *args, str(tmp_path / 'entree.csv')], env=env,
                              capture_output=True, text=True)

    def beneficiaires():
        return int(subprocess.run(
            ['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport', '-Atc',
             'select count(*) from public.beneficiaires'],
            capture_output=True, text=True, check=True).stdout)

    return tmp_path, run, beneficiaires, received


def sha1(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def test_dry_run_changes_nothing_outside_its_run_directory(workspace):
    tmp_path, run, beneficiaires, received = workspace
    codes_before = sha1(tmp_path / 'codes.csv')

    result = run('--dry-run')

    assert result.returncode == 0, result.stdout + result.stderr
    assert sha1(tmp_path / 'codes.csv') == codes_before
    assert list((tmp_path / 'drop').iterdir()) == []
    assert beneficiaires() == 0
    assert received == []

    run_dir = (tmp_path / 'run' / 'latest').resolve()
    assert run_dir.name.endswith('-dry-run')
    assert (run_dir / 'envois.csv').read_text().count(';simule;') == 2
    assert not (run_dir / 'existing-codes-dry-run.csv').exists()


def test_real_run_injects_drops_and_mails_then_a_rerun_finds_everyone(workspace):
    tmp_path, run, beneficiaires, received = workspace

    result = run()

    assert result.returncode == 0, result.stdout + result.stderr
    assert beneficiaires() == 2
    dropped = list((tmp_path / 'drop').glob('beneficiaires-insertion-2-*.csv'))
    assert len(dropped) == 1
    assert len(received) == 2
    assert received[0]['message'] == ['1006']
    assert received[0]['destinataires[tozal@example.org][BENEFICIAIRE_PRENOM]'] == ['Tozal']

    # The /nfs/run consumer takes the file; the same CSV then finds both people in lamp01.
    dropped[0].unlink()
    rerun = run()

    assert rerun.returncode == 0, rerun.stdout + rerun.stderr
    assert 'rien-a-faire' in (tmp_path / 'run' / 'latest' / 'STATUT').read_text()
    assert beneficiaires() == 2
    assert len(received) == 2
    assert list((tmp_path / 'drop').iterdir()) == []


def test_refuses_to_run_while_a_previous_drop_is_pending(workspace):
    tmp_path, run, beneficiaires, received = workspace
    (tmp_path / 'drop' / 'beneficiaires-insertion-1-2026-01-01T00-00-00.csv').write_text('x')

    result = run()

    assert result.returncode != 0
    assert 'dépôt précédent non consommé' in result.stdout
    assert beneficiaires() == 0
    assert received == []
