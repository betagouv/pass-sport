"""Tests de alerte_echecs.sh, l'alerte courriel lancée après chaque passage FranceConnect.

Le script tourne pour de vrai sur un passages.log écrit dans tmp_path ; sendmail est remplacé
par un faux qui range chaque courriel dans un fichier.

Lancer depuis data/ : source .venv/bin/activate && pytest 2026/partners/franceconnect/test_alerte_echecs.py
"""

import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name('alerte_echecs.sh')
DESTINATAIRES = ['kelvao@example.invalid', 'brindu@example.invalid']


@pytest.fixture
def env(tmp_path):
    outbox = tmp_path / 'outbox'
    outbox.mkdir()
    fake = tmp_path / 'sendmail'
    fake.write_text(
        '#!/usr/bin/env bash\n'
        '[[ -e "$OUTBOX/../sendmail-fails" ]] && exit 75\n'
        'n=$(ls "$OUTBOX" | wc -l)\n'
        'printf "%s\\n" "$*" >"$OUTBOX/$n.args"\n'
        'cat >"$OUTBOX/$n.eml"\n'
    )
    fake.chmod(0o755)
    runs = tmp_path / 'run'
    runs.mkdir()
    return {'runs': runs, 'outbox': outbox, 'vars': {'SENDMAIL': str(fake), 'OUTBOX': str(outbox), 'PATH': '/usr/bin:/bin'}}


_counter = iter(range(10_000))


def record(env, *statuses):
    """Appends one line per status, in run_fc_pipeline.sh's record_run format."""
    with open(env['runs'] / 'passages.log', 'a') as f:
        for status in statuses:
            name = f'2026-11-16T{next(_counter):08d}'
            if status.endswith('-dry-run'):
                name += '-dry-run'
                status = status.removesuffix('-dry-run')
            code = 1 if status == 'echec' else 0
            f.write(f'{name}  {status:<13}  {code:>3}  résumé de {status}\n')


def check(env, seuil=3):
    args = [str(SCRIPT), '--seuil', str(seuil), '--dossier-passages', str(env['runs'])]
    for d in DESTINATAIRES:
        args += ['--destinataire', d]
    return subprocess.run(args, env=env['vars'], capture_output=True, text=True)


def mails(env):
    return sorted(env['outbox'].glob('*.eml'))


def test_deux_echecs_ne_previennent_personne(env):
    record(env, 'succes', 'echec', 'echec')
    assert check(env).returncode == 0
    assert mails(env) == []


def test_trois_echecs_envoient_un_courriel_aux_destinataires(env):
    record(env, 'succes', 'echec', 'echec', 'echec')
    assert check(env).returncode == 0
    [mail] = mails(env)
    body = mail.read_text()
    assert 'To: kelvao@example.invalid, brindu@example.invalid' in body
    assert 'Subject: [pass Sport] FranceConnect : 3 passages en echec' in body
    assert body.count('résumé de echec') == 3
    assert 'résumé de succes' not in body
    assert (env['outbox'] / '0.args').read_text().split() == ['-t', '-oi']


def test_un_seul_courriel_par_serie(env):
    record(env, 'echec', 'echec', 'echec')
    check(env)
    record(env, 'echec')
    check(env)
    record(env, 'echec')
    check(env)
    assert len(mails(env)) == 1


def test_un_succes_rearme_l_alerte(env):
    record(env, 'echec', 'echec', 'echec')
    check(env)
    record(env, 'succes', 'echec', 'echec', 'echec')
    check(env)
    assert len(mails(env)) == 2


def test_un_succes_glisse_entre_deux_verifications_rearme_aussi(env):
    record(env, 'echec', 'echec', 'echec')
    check(env)
    record(env, 'succes', 'echec')
    check(env)
    record(env, 'echec', 'echec')
    check(env)
    assert len(mails(env)) == 2


def test_rien_a_faire_casse_la_serie(env):
    record(env, 'echec', 'echec', 'rien-a-faire', 'echec')
    check(env)
    assert mails(env) == []


def test_passages_a_blanc_et_verrou_ne_comptent_pas_dans_les_echecs(env):
    record(env, 'echec', 'succes-dry-run', 'ignore-verrou', 'echec', 'echec-dry-run', 'echec')
    check(env)
    [mail] = mails(env)
    assert 'passages en echec' in mail.read_text()


def test_passage_bloque_previent_une_fois(env):
    record(env, 'succes', 'ignore-verrou', 'ignore-verrou', 'ignore-verrou')
    check(env)
    record(env, 'ignore-verrou')
    check(env)
    [mail] = mails(env)
    body = mail.read_text()
    assert 'Subject: [pass Sport] FranceConnect : passage bloque, 3 passages' in body
    assert body.count('résumé de ignore-verrou') == 3


def test_fin_du_blocage_rearme_l_alerte(env):
    record(env, 'ignore-verrou', 'ignore-verrou', 'ignore-verrou')
    check(env)
    record(env, 'succes', 'ignore-verrou', 'ignore-verrou', 'ignore-verrou')
    check(env)
    assert len(mails(env)) == 2


def test_sendmail_en_echec_laisse_l_alerte_a_renvoyer(env):
    record(env, 'echec', 'echec', 'echec')
    (env['outbox'].parent / 'sendmail-fails').touch()
    assert check(env).returncode != 0
    assert not (env['runs'] / 'alerte-echec-envoyee').exists()
    (env['outbox'].parent / 'sendmail-fails').unlink()
    record(env, 'echec')
    assert check(env).returncode == 0
    assert len(mails(env)) == 1


def test_sans_passages_log_rien_a_faire(env):
    assert check(env).returncode == 0
    assert mails(env) == []


def test_seuil_parametrable(env):
    record(env, 'echec', 'echec')
    check(env, seuil=2)
    assert len(mails(env)) == 1


@pytest.mark.parametrize('args', [['--seuil', '0', '--destinataire', 'a@b'], ['--seuil', '3']])
def test_arguments_invalides(env, args):
    result = subprocess.run([str(SCRIPT), *args], env=env['vars'], capture_output=True, text=True)
    assert result.returncode == 2
