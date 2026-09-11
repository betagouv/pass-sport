"""Integration tests for match_beneficiaires.sql, one scenario per matching strategy.

The SQL under test runs against the lamp01 schema, so these tests spin up a throwaway
postgres:18-alpine container with lamp01/db-init mounted — the exact DDL the pipeline
queries, per-strategy indexes and normalise_recherche included. Docker missing or the
daemon down skips the whole module instead of failing it.

Every test seeds its own `beneficiaires` rows (the tables are truncated between tests),
forges a candidate CSV with the exact MATCH_COLUMNS header, replays
`psql -f match_beneficiaires.sql` inside the container, and asserts on the three outputs:
the apparies CSV, the non-apparies CSV and the final recap counters.

Run from data/ : source .venv/bin/activate && pytest 2026/partners/franceconnect/test_match_beneficiaires.py
"""

import csv
import io
import subprocess
import shutil
import time
import uuid
from pathlib import Path

import pytest

import clean_fc_lib as lib

FC_DIR = Path(__file__).resolve().parent
DB_INIT_DIR = FC_DIR.parents[3] / 'lamp01' / 'db-init'

# The columns of the recap SELECT that closes match_beneficiaires.sql, in its order.
RECAP_COLONNES = [
    'candidats', 'par_boursier', 'par_aah_msa', 'par_aah_caf', 'par_aeeh_msa',
    'par_aeeh_caf', 'par_qf_msa', 'par_qf_caf', 'inconcluants', 'non_apparies',
]


@pytest.fixture(scope='session')
def pg():
    """A throwaway container carrying the lamp01 schema; skipped when docker is absent."""
    if shutil.which('docker') is None:
        pytest.skip('docker introuvable')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'fc-match-sql-{uuid.uuid4().hex[:8]}'
    lancement = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test',
         '-e', 'POSTGRES_USER=u_passsport',
         '-e', 'POSTGRES_DB=passsport',
         '-v', f'{DB_INIT_DIR}:/docker-entrypoint-initdb.d:ro',
         'postgres:18-alpine'],
        capture_output=True, text=True)
    if lancement.returncode != 0:
        pytest.skip(f'conteneur postgres impossible à lancer : {lancement.stderr.strip()}')

    try:
        # Ready means the init scripts ran to completion, not just that postgres answers:
        # the image starts a temporary server while loading db-init, then restarts it.
        for _ in range(120):
            pret = subprocess.run(
                ['docker', 'exec', name, 'psql', '-U', 'u_passsport', '-d', 'passsport',
                 '-Atc', 'select 1 from public.beneficiaires limit 1'],
                capture_output=True)
            if pret.returncode == 0:
                break
            time.sleep(0.5)
        else:
            pytest.fail('le schéma lamp01 ne s\'est pas chargé dans le conteneur')
        yield name
    finally:
        subprocess.run(['docker', 'stop', name], capture_output=True)


def executer_sql(pg, sql: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ['docker', 'exec', '-i', pg, 'psql', '-U', 'u_passsport', '-d', 'passsport',
         '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'],
        input=sql, capture_output=True, text=True)


def _lit(valeur) -> str:
    """One SQL literal; '' and None both become NULL, like an absent partner field."""
    if valeur is None or valeur == '':
        return 'null'
    return "'" + str(valeur).replace("'", "''") + "'"


def ligne_base(**overrides) -> dict:
    """One beneficiaires row, defaulted to a CAF 'jeune' child of exercice 5."""
    row = {
        'id_psp': 'PSP-1',
        'nom': 'MARTIN',
        'prenom': 'LEA',
        # The pipelines store birthdates shifted by 4 hours; the matching only reads the day.
        'date_naissance': '2015-06-01 04:00:00',
        'genre': 'F',
        'organisme': 'CAF',
        'situation': 'jeune',
        'allocataire_matricule': None,
        'allocataire_qualite': 'Mme',
        'allocataire_nom': 'MARTIN',
        'allocataire_prenom': 'CLAIRE',
        'allocataire_date_naissance': None,
        'exercice_id': 5,
    }
    row.update(overrides)
    return row


def ligne_extra(**overrides) -> dict:
    """One beneficiaire_cnaf_extra_field row — what reconcile_cnaf recovers for ARS rows."""
    row = {
        'id_psp': 'PSP-1',
        'cnaf_allocataire_nom_naissance': 'BOLIMEK',
        'cnaf_allocataire_date_naissance': '1985-03-02',
        'cnaf_allocataire_genre': 'female',
    }
    row.update(overrides)
    return row


def candidat(**overrides) -> dict:
    """One row of the match CSV; every MATCH_COLUMNS field defaults to absent."""
    row = {colonne: '' for colonne in lib.MATCH_COLUMNS}
    row['eligibility_result_id'] = 'c1'
    row.update(overrides)
    return row


def rapprocher(pg, base=(), candidats=(), extra=(), exercices=()):
    """Seed the tables, run match_beneficiaires.sql, return (apparies, non_apparies, recap).

    `apparies` maps eligibility_result_id to id_psp, `non_apparies` is a list of ids and
    `recap` the counters of the closing SELECT. A guard failure (duplicate id_psp) raises
    through psql's exit code instead — see the dedicated test.
    """
    graine = ['truncate table public.beneficiaire_cnaf_extra_field, public.beneficiaires;']
    for exercice in exercices:
        graine.append(
            f"insert into public.exercices (id, libelle) values ({exercice}, 'test')"
            ' on conflict do nothing;')
    for row in base:
        graine.append('insert into public.beneficiaires ({}) values ({});'.format(
            ', '.join(row), ', '.join(_lit(v) for v in row.values())))
    for row in extra:
        graine.append('insert into public.beneficiaire_cnaf_extra_field ({}) values ({});'.format(
            ', '.join(row), ', '.join(_lit(v) for v in row.values())))
    semis = executer_sql(pg, '\n'.join(graine))
    assert semis.returncode == 0, semis.stderr

    tampon = io.StringIO()
    plume = csv.DictWriter(tampon, fieldnames=lib.MATCH_COLUMNS, delimiter=';')
    plume.writeheader()
    plume.writerows(candidats)

    # A private working directory per run: the SQL reads its fixed-name CSV from the
    # current directory and \o writes the two output files next to it.
    dossier = f'/tmp/match-{uuid.uuid4().hex[:8]}'
    subprocess.run(['docker', 'exec', pg, 'mkdir', '-p', dossier], check=True)
    subprocess.run(
        ['docker', 'exec', '-i', pg, 'sh', '-c',
         f'cat > {dossier}/fc_2026_match_candidates.csv'],
        input=tampon.getvalue(), text=True, check=True)
    subprocess.run(
        ['docker', 'exec', '-i', pg, 'sh', '-c', f'cat > {dossier}/match_beneficiaires.sql'],
        input=(FC_DIR / 'match_beneficiaires.sql').read_text(), text=True, check=True)

    passage = subprocess.run(
        ['docker', 'exec', '-w', dossier, pg, 'psql', '-U', 'u_passsport', '-d', 'passsport',
         '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-f', 'match_beneficiaires.sql'],
        capture_output=True, text=True)
    if passage.returncode != 0:
        raise RuntimeError(passage.stderr)

    def lire(fichier: str) -> list[dict]:
        contenu = subprocess.run(
            ['docker', 'exec', pg, 'cat', f'{dossier}/{fichier}'],
            capture_output=True, text=True, check=True).stdout
        return list(csv.DictReader(io.StringIO(contenu), delimiter=';'))

    apparies = {ligne['eligibility_result_id']: ligne['id_psp']
                for ligne in lire('fc_2026_apparies.csv')}
    non_apparies = [ligne['eligibility_result_id'] for ligne in lire('fc_2026_non_apparies.csv')]

    bilan = [ligne for ligne in passage.stdout.splitlines() if '|' in ligne][-1]
    recap = dict(zip(RECAP_COLONNES, (int(v) for v in bilan.split('|'))))

    return apparies, non_apparies, recap


# --- boursier (CNOUS) : l'INE ------------------------------------------------------

BASE_BOURSIER = dict(id_psp='PSP-B1', nom='BERNARD', prenom='ALEX',
                     date_naissance='2000-05-05 04:00:00', genre='M',
                     organisme='cnous', situation='boursier',
                     allocataire_matricule='INE001', allocataire_qualite='M',
                     allocataire_nom='BERNARD', allocataire_prenom='ALEX')

CANDIDAT_BOURSIER = dict(situation='boursier', organisme='cnous', ine='INE001',
                         beneficiaire_nom='BERNARD', beneficiaire_prenom='Alex',
                         beneficiaire_date_naissance='2000-05-05', beneficiaire_genre='M')


def test_boursier_apparie_par_ine(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_BOURSIER)], candidats=[candidat(**CANDIDAT_BOURSIER)])
    assert apparies == {'c1': 'PSP-B1'}
    assert recap['par_boursier'] == 1


def test_boursier_ine_inconnu_reste_non_apparie(pg):
    apparies, non_apparies, _ = rapprocher(
        pg, base=[ligne_base(**BASE_BOURSIER)],
        candidats=[candidat(**{**CANDIDAT_BOURSIER, 'ine': 'INE999'})])
    assert apparies == {}
    assert non_apparies == ['c1']


# --- AAH : nom de naissance côté MSA, nom d'usage côté CAF, les deux essayées -------

BASE_AAH_MSA = dict(id_psp='PSP-A1', nom='DURAND', prenom='JEAN',
                    date_naissance='1990-05-10 04:00:00', genre='M',
                    organisme='MSA', situation='AAH', allocataire_qualite='M',
                    allocataire_nom='DURAND', allocataire_prenom='JEAN')

# The AAH route made no quotient_familial call: `organisme` is clean_fc_lib's CAF default
# and the strategies ignore it.
CANDIDAT_AAH = dict(situation='AAH', organisme='CAF',
                    beneficiaire_nom='DURAND', beneficiaire_prenom='Jean Pierre',
                    beneficiaire_date_naissance='1990-05-10', beneficiaire_genre='M')


def test_aah_msa_apparie_sur_le_nom_de_naissance(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_AAH_MSA)], candidats=[candidat(**CANDIDAT_AAH)])
    assert apparies == {'c1': 'PSP-A1'}
    assert recap['par_aah_msa'] == 1


def test_aah_caf_apparie_sur_le_nom_d_usage(pg):
    base = ligne_base(**{**BASE_AAH_MSA, 'organisme': 'CAF', 'nom': 'VORSALDE',
                         'allocataire_nom': 'VORSALDE'})
    cand = candidat(**{**CANDIDAT_AAH, 'beneficiaire_nom': 'DURAND',
                       'beneficiaire_nom_usage': 'Vorsalde'})
    apparies, _, recap = rapprocher(pg, base=[base], candidats=[cand])
    assert apparies == {'c1': 'PSP-A1'}
    assert recap['par_aah_caf'] == 1


def test_aah_sans_nom_d_usage_seule_la_strategie_msa_peut_conclure(pg):
    # No preferred_username on the candidate: the CAF strategy returns nothing, which is
    # exactly what lets the MSA hit stand alone and conclude.
    base_caf = ligne_base(**{**BASE_AAH_MSA, 'id_psp': 'PSP-A2', 'organisme': 'CAF'})
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_AAH_MSA), base_caf], candidats=[candidat(**CANDIDAT_AAH)])
    assert apparies == {'c1': 'PSP-A1'}
    assert recap['par_aah_msa'] == 1


def test_aah_les_deux_strategies_a_une_ligne_restent_inconcluantes(pg):
    # One MSA row found by the birth name, one CAF row found by the usage name: each
    # strategy returns exactly one row, so neither wins — even a single shared person
    # would stay inconclusive by the same rule.
    base_msa = ligne_base(**BASE_AAH_MSA)
    base_caf = ligne_base(**{**BASE_AAH_MSA, 'id_psp': 'PSP-A2', 'organisme': 'CAF',
                             'nom': 'VORSALDE', 'allocataire_nom': 'VORSALDE'})
    cand = candidat(**{**CANDIDAT_AAH, 'beneficiaire_nom_usage': 'Vorsalde'})
    apparies, non_apparies, recap = rapprocher(
        pg, base=[base_msa, base_caf], candidats=[cand])
    assert apparies == {}
    assert non_apparies == ['c1']
    assert recap['inconcluants'] == 1


def test_aah_deux_homonymes_dans_la_meme_caisse_restent_inconcluants(pg):
    homonyme = ligne_base(**{**BASE_AAH_MSA, 'id_psp': 'PSP-A2'})
    apparies, non_apparies, recap = rapprocher(
        pg, base=[ligne_base(**BASE_AAH_MSA), homonyme], candidats=[candidat(**CANDIDAT_AAH)])
    assert apparies == {}
    assert non_apparies == ['c1']
    assert recap['inconcluants'] == 1


# --- AEEH : allocataire + bénéficiaire, la date de l'allocataire côté MSA seulement --

BASE_AEEH_MSA = dict(id_psp='PSP-E1', nom='ZELVIK', prenom='LEA',
                     date_naissance='2012-03-04 04:00:00', genre='F',
                     organisme='MSA', situation='AEEH', allocataire_qualite='Mme',
                     allocataire_nom='ZELVIK', allocataire_prenom='HALVI',
                     allocataire_date_naissance='1980-01-02')

CANDIDAT_AEEH_MSA = dict(situation='AEEH', organisme='MSA',
                         allocataire_nom='ZELVIK', allocataire_prenom='Halvi Marie',
                         allocataire_date_naissance='1980-01-02',
                         allocataire_qualite='Mme', allocataire_genre='female',
                         beneficiaire_nom='ZELVIK', beneficiaire_prenom='Lea',
                         beneficiaire_date_naissance='2012-03-04', beneficiaire_genre='F')


def test_aeeh_msa_apparie_sur_l_identite_complete(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_AEEH_MSA)], candidats=[candidat(**CANDIDAT_AEEH_MSA)])
    assert apparies == {'c1': 'PSP-E1'}
    assert recap['par_aeeh_msa'] == 1


def test_aeeh_msa_exige_la_date_de_naissance_de_l_allocataire(pg):
    cand = candidat(**{**CANDIDAT_AEEH_MSA, 'allocataire_date_naissance': ''})
    apparies, non_apparies, _ = rapprocher(
        pg, base=[ligne_base(**BASE_AEEH_MSA)], candidats=[cand])
    assert apparies == {}
    assert non_apparies == ['c1']


BASE_AEEH_CAF = dict(id_psp='PSP-E2', nom='ENFCAF', prenom='ZOE',
                     date_naissance='2010-09-09 04:00:00', genre='F',
                     organisme='CAF', situation='AEEH', allocataire_qualite='M',
                     allocataire_nom='RESPUSAGE', allocataire_prenom='PAUL')

CANDIDAT_AEEH_CAF = dict(situation='AEEH', organisme='CAF',
                         allocataire_nom='AUTRENOM', allocataire_nom_usage='Respusage',
                         allocataire_prenom='Paul Henri', allocataire_qualite='M',
                         allocataire_genre='male',
                         beneficiaire_nom='ENFCAF', beneficiaire_prenom='Zoe',
                         beneficiaire_date_naissance='2010-09-09', beneficiaire_genre='F')


def test_aeeh_caf_apparie_sur_le_nom_d_usage_sans_date_allocataire(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_AEEH_CAF)], candidats=[candidat(**CANDIDAT_AEEH_CAF)])
    assert apparies == {'c1': 'PSP-E2'}
    assert recap['par_aeeh_caf'] == 1


def test_aeeh_caf_accepte_le_nomenf_via_le_nom_d_usage_de_l_enfant(pg):
    # NOMENF carries no birth-name suffix: the base row may hold the child's usage name,
    # which the candidate then only matches through beneficiaire_nom_usage.
    base = ligne_base(**{**BASE_AEEH_CAF, 'nom': 'ZALQUIN'})
    cand = candidat(**{**CANDIDAT_AEEH_CAF, 'beneficiaire_nom_usage': 'Zalquin'})
    apparies, _, _ = rapprocher(pg, base=[base], candidats=[cand])
    assert apparies == {'c1': 'PSP-E2'}


def test_aeeh_les_prenoms_du_beneficiaire_sont_stricts(pg):
    # Unlike AAH and QF, the AEEH rules compare the beneficiary's given names on strict
    # equality: an extra FranceConnect given name is a mismatch.
    cand = candidat(**{**CANDIDAT_AEEH_CAF, 'beneficiaire_prenom': 'Zoe Marie'})
    apparies, non_apparies, _ = rapprocher(
        pg, base=[ligne_base(**BASE_AEEH_CAF)], candidats=[cand])
    assert apparies == {}
    assert non_apparies == ['c1']


# --- jeune (QF) : nom de naissance de l'allocataire des deux côtés -------------------

BASE_QF_MSA = dict(id_psp='PSP-Q2', nom='OSVAREK', prenom='TOM',
                   date_naissance='2014-01-01 04:00:00', genre='M',
                   organisme='MSA', situation='jeune', allocataire_qualite='M',
                   allocataire_nom='OSVAREK', allocataire_prenom='MIRSA',
                   allocataire_date_naissance='1979-07-08')

CANDIDAT_QF_MSA = dict(situation='jeune', organisme='MSA',
                       allocataire_nom='OSVAREK', allocataire_prenom='Mirsa Paul',
                       allocataire_date_naissance='1979-07-08',
                       allocataire_qualite='M', allocataire_genre='male',
                       beneficiaire_nom='OSVAREK', beneficiaire_prenom='Tom Alexandre',
                       beneficiaire_date_naissance='2014-01-01', beneficiaire_genre='M')


def test_qf_msa_apparie_avec_les_prenoms_en_containment(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base(**BASE_QF_MSA)], candidats=[candidat(**CANDIDAT_QF_MSA)])
    assert apparies == {'c1': 'PSP-Q2'}
    assert recap['par_qf_msa'] == 1


CANDIDAT_QF_CAF = dict(situation='jeune', organisme='CAF',
                       allocataire_nom='BOLIMEK', allocataire_prenom='Claire Ysolde',
                       allocataire_date_naissance='1985-03-02',
                       allocataire_qualite='Mme', allocataire_genre='female',
                       beneficiaire_nom='MARTIN', beneficiaire_prenom='Lea',
                       beneficiaire_date_naissance='2015-06-01', beneficiaire_genre='F')


def test_qf_caf_apparie_via_beneficiaire_cnaf_extra_field(pg):
    apparies, _, recap = rapprocher(
        pg, base=[ligne_base()], extra=[ligne_extra()],
        candidats=[candidat(**CANDIDAT_QF_CAF)])
    assert apparies == {'c1': 'PSP-1'}
    assert recap['par_qf_caf'] == 1


def test_qf_caf_sans_ligne_extra_field_reste_non_apparie(pg):
    # The birth name, gender and birthdate of the allocataire only exist in the side
    # table: a CNAF row that reconcile_cnaf never covered cannot be matched.
    apparies, non_apparies, _ = rapprocher(
        pg, base=[ligne_base()], candidats=[candidat(**CANDIDAT_QF_CAF)])
    assert apparies == {}
    assert non_apparies == ['c1']


# --- Les règles transverses ----------------------------------------------------------

def test_le_containment_ne_marche_que_de_la_base_vers_franceconnect(pg):
    # Base 'JEAN PIERRE' against FranceConnect 'Jean': the LAMP given names are not all
    # contained in the FranceConnect ones, whatever the overlap.
    base = ligne_base(**{**BASE_AAH_MSA, 'prenom': 'JEAN PIERRE'})
    cand = candidat(**{**CANDIDAT_AAH, 'beneficiaire_prenom': 'Jean'})
    apparies, non_apparies, _ = rapprocher(pg, base=[base], candidats=[cand])
    assert apparies == {}
    assert non_apparies == ['c1']


def test_accents_apostrophes_et_traits_d_union_sont_normalises(pg):
    base = ligne_base(**{**BASE_AAH_MSA, 'nom': "N'GUYEN", 'prenom': 'JEAN PIERRE'})
    cand = candidat(**{**CANDIDAT_AAH, 'beneficiaire_nom': 'Nguyên',
                       'beneficiaire_prenom': 'Jean-Pierre Marie'})
    apparies, _, _ = rapprocher(pg, base=[base], candidats=[cand])
    assert apparies == {'c1': 'PSP-A1'}


def test_une_ligne_d_un_autre_exercice_est_invisible(pg):
    base = ligne_base(**{**BASE_AAH_MSA, 'exercice_id': 4})
    apparies, non_apparies, _ = rapprocher(
        pg, base=[base], candidats=[candidat(**CANDIDAT_AAH)], exercices=[4])
    assert apparies == {}
    assert non_apparies == ['c1']


def test_la_situation_et_la_caisse_de_la_base_filtrent(pg):
    # Same identity, wrong pigeonhole: a candidate only searches the base rows carrying
    # its own situation and caisse.
    base = ligne_base(**{**BASE_QF_MSA, 'situation': 'AEEH'})
    apparies, non_apparies, _ = rapprocher(
        pg, base=[base], candidats=[candidat(**CANDIDAT_QF_MSA)])
    assert apparies == {}
    assert non_apparies == ['c1']


def test_un_id_psp_servi_a_deux_candidats_fait_echouer_le_passage(pg):
    jumeaux = [candidat(eligibility_result_id='c1', **CANDIDAT_AAH),
               candidat(eligibility_result_id='c2', **CANDIDAT_AAH)]
    with pytest.raises(RuntimeError, match='RAPPROCHEMENT AMBIGU'):
        rapprocher(pg, base=[ligne_base(**BASE_AAH_MSA)], candidats=jumeaux)
