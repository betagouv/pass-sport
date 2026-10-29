"""The FranceConnect matching (franceconnect/match_beneficiaires.sql) against the codes dn-pipeline
injects into lamp01. A child coded from a DN dossier and later judged eligible by FranceConnect
(relance, a new quotient month, the other parent) must be found again, not given a second code.

Runs clean, the FranceConnect code drawing and split, and lamp01/inject_csv.sh for real, against
a throwaway lamp01. Skipped without docker or psql.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_fc_finds_dn_codes.py
"""

import csv
import io
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pandas as pd
import pytest

# First: it puts the partners and FranceConnect directories on sys.path.
import dn_pipeline as pipeline

import clean_fc_lib as fc  # noqa: E402
import fc_pipeline  # noqa: E402
from test_dn_pipeline import dn_dossier, enfant, raw_dn, read, run_clean  # noqa: E402

LAMP_DIR = Path(__file__).resolve().parents[3] / 'lamp01'

APPLICANT_BIRTHDATE = '1985-03-02'

# reference -> (situation, organisme, prénom, date de naissance) of each child coded by dn-pipeline.
CHILDREN = {
    'dn:101:enfant-1': ('AEEH', 'CAF', 'Ola', '2015-03-12'),
    'dn:101:enfant-2': ('jeune', 'CAF', 'Lio', '2012-01-02'),
    'dn:102:enfant-1': ('AEEH', 'MSA', 'Ema', '2014-05-06'),
    'dn:102:enfant-2': ('jeune', 'MSA', 'Noa', '2011-07-08'),
}


@pytest.fixture(scope='module')
def lamp():
    for tool in ('docker', 'psql'):
        if shutil.which(tool) is None:
            pytest.skip(f'{tool} introuvable')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'fc-dn-{uuid.uuid4().hex[:8]}'
    started = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=u_passsport',
         '-e', 'POSTGRES_DB=passsport', '-p', '127.0.0.1::5432',
         '-v', f'{LAMP_DIR / "db-init"}:/docker-entrypoint-initdb.d:ro', 'postgres:18-alpine'],
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
def drawn(lamp, tmp_path_factory) -> dict:
    """Injected once: a second injection would give every child a second code to find."""
    return code_and_inject(tmp_path_factory.mktemp('dn'), lamp[1])


def dossier(number, caisse, *children):
    return dn_dossier(number=number, beneficiaire_de='', date_naissance=APPLICANT_BIRTHDATE,
                      caisse=caisse, enfants=list(children))


def code_and_inject(tmp_path, port) -> dict:
    """dn-pipeline's whole way into lamp01; returns the code drawn for each reference."""
    _, paths = run_clean(tmp_path, dn=raw_dn(
        dossier(101, 'CAF', enfant('Ola', aeeh='Oui', date_naissance='2015-03-12'),
                enfant('Lio', aeeh='Non', date_naissance='2012-01-02')),
        dossier(102, 'MSA', enfant('Ema', aeeh='Oui', date_naissance='2014-05-06'),
                enfant('Noa', aeeh='Non', date_naissance='2011-07-08'))))

    codes = tmp_path / 'codes.csv'
    codes.write_text('code\n')
    fc_pipeline.codes.generate_codes_for_file(paths['clean'], tmp_path / 'with_codes.csv', codes)
    fc_pipeline.split_writeback(tmp_path / 'with_codes.csv', tmp_path / 'writeback.csv',
                                tmp_path / 'prod.csv', paths['cnaf'], tmp_path / 'lamp.csv')

    injected = subprocess.run(
        ['bash', str(LAMP_DIR / 'inject_csv.sh'), '--port', port, str(tmp_path / 'lamp.csv')],
        env={**os.environ, 'LAMP_DB_HOST': '127.0.0.1', 'LAMP_DB_USER': 'u_passsport',
             'LAMP_DB_NAME': 'passsport', 'LAMP_DB_PASSWORD': 'test'},
        capture_output=True, text=True)
    assert injected.returncode == 0, injected.stderr

    drawn = read(tmp_path / 'writeback.csv').merge(read(paths['identities']), on='eligibility_result_id')
    return dict(zip(drawn['reference'], drawn['id_psp'], strict=True))


def fc_candidate(reference, situation, organisme, prenom, birthdate) -> dict:
    """The child as FranceConnect presents it when the applicant logs in again: the QF answer
    carries no usage name, so the CAF strategies can only go through the side table."""
    row = {column: '' for column in fc.MATCH_COLUMNS}
    row.update(
        eligibility_result_id=reference, situation=situation, organisme=organisme,
        allocataire_nom='DORVAT', allocataire_prenom='Pim',
        allocataire_date_naissance=APPLICANT_BIRTHDATE, allocataire_qualite='M',
        allocataire_genre='male', beneficiaire_nom='DORVAT', beneficiaire_prenom=prenom,
        beneficiaire_date_naissance=birthdate, beneficiaire_genre='F')
    return row


def fc_match(container, candidates) -> tuple[dict, list]:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fc.MATCH_COLUMNS, delimiter=';')
    writer.writeheader()
    writer.writerows(candidates)

    workdir = f'/tmp/fc-match-{uuid.uuid4().hex[:8]}'
    subprocess.run(['docker', 'exec', container, 'mkdir', '-p', workdir], check=True)
    sql = (pipeline.FC_DIR / 'match_beneficiaires.sql').read_text()
    for filename, content in (('fc_2026_match_candidates.csv', buffer.getvalue()),
                              ('match_beneficiaires.sql', sql)):
        subprocess.run(['docker', 'exec', '-i', container, 'sh', '-c', f'cat > {workdir}/{filename}'],
                       input=content, text=True, check=True)
    ran = subprocess.run(
        ['docker', 'exec', '-w', workdir, container, 'psql', '-U', 'u_passsport', '-d', 'passsport',
         '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-f', 'match_beneficiaires.sql'],
        capture_output=True, text=True)
    assert ran.returncode == 0, ran.stderr

    def output(filename):
        content = subprocess.run(['docker', 'exec', container, 'cat', f'{workdir}/{filename}'],
                                 capture_output=True, text=True, check=True).stdout
        return pd.read_csv(io.StringIO(content), sep=';', dtype=str, keep_default_na=False)

    matched = output('fc_2026_apparies.csv')
    return (dict(zip(matched['eligibility_result_id'], matched['id_psp'], strict=True)),
            output('fc_2026_non_apparies.csv')['eligibility_result_id'].tolist())


def test_franceconnect_finds_again_every_child_coded_from_a_dn_dossier(lamp, drawn):
    assert set(drawn) == set(CHILDREN)

    matched, unmatched = fc_match(
        lamp[0], [fc_candidate(reference, *child) for reference, child in CHILDREN.items()])

    assert unmatched == []
    assert matched == drawn


def test_franceconnect_finds_them_under_the_other_child_situation_too(lamp, drawn):
    # dn-pipeline codes a declared AEEH under AEEH; FranceConnect puts the same child under jeune
    # when the quotient covers it, and under AEEH a child dn-pipeline coded through the QF question.
    other_situation = {'AEEH': 'jeune', 'jeune': 'AEEH'}
    matched, unmatched = fc_match(
        lamp[0], [fc_candidate(reference, other_situation[situation], *rest)
                  for reference, (situation, *rest) in CHILDREN.items()])

    assert unmatched == []
    assert matched == drawn
