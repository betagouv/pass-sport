"""Integration tests for the LCA dashboards: the LCA export kit (specs/dashboard/) and the
load into the site database (load_dashboard.sql).

One throwaway postgres:16 container holds two databases: `lca`, a subset of the LCA schema
seeded below, and `site`, built from the worker's drizzle migrations. The export runs the very
script the LCA host is handed; the load runs the very SQL run_dashboard.sh plays through the
Scalingo tunnel. Docker missing or the daemon down skips the whole module instead of failing it.

The seed spans the three days before today (Paris): J-3, J-2 and J-1. Beneficiaires, all
exercice 5 unless stated, with the id_etat of each inscription:

  b1  F   CAF    jeune     INSEE 75056        born 2015-06-01   J-3 10:00 (1), J-1 09:00 (2)
  b2  M   MSA    AAH       INSEE 2A004        born 1998-03-10   J-1 00:30 (3), still J-2 in UTC
  b3  F   CCMSA  aaeh      postal 20200       born 2010-12-31   J-1 15:00 (4)
  b4  M   CROUS  boursier  INSEE 97411        born 2004-07-14   J-2 10:00 (5), which does not activate a code
  b5  F   cnous  AEEH      no code            no birthdate      today 08:00 (1), not a full day yet
  b6  -   CAF    jeune     unresolvable codes born 2015-01-01   J-1 12:00 (1)
  b7  refused                                  J-2 (1)
  b8  exercice 4                               J-2 (1)

Run from data/ : source .venv/bin/activate && pytest 2026/dashboard
"""

import csv
import io
import shutil
import subprocess
import time
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

TDB_DIR = Path(__file__).resolve().parent
REPO_DIR = TDB_DIR.parents[2]
KIT_DIR = REPO_DIR / 'specs' / 'dashboard'
MIGRATIONS_DIR = REPO_DIR / 'worker' / 'drizzle'

TABLEAUX = ['genre', 'situation', 'organisme', 'region', 'departement', 'age', 'federation']
# genre 2 + Total, situation 4 + Total, organisme 3 + Total, region 5 + Total, the 104
# departements + Non renseigné + Total, age 4 + Total, federation 2 + Non renseigné + Total.
LIGNES_PAR_JOUR = 3 + 5 + 4 + 6 + 106 + 5 + 4
CSV_HEADER = ['tableau', 'jour', 'code', 'libelle', 'eligibles', 'codes_actives',
              'codes_actives_du_jour', 'taux_recours', 'part_eligibles', 'part_actives']

LCA_SCHEMA = """
create type beneficiaire_genre as enum ('M', 'F');
create type organisme as enum ('CAF', 'MSA', 'CCMSA', 'CROUS', 'cnous');
create type situation as enum ('AAH', 'aah', 'AEEH', 'aaeh', 'Jeune', 'jeune', 'boursier');

create table beneficiaires (
  id integer primary key,
  genre beneficiaire_genre,
  organisme organisme,
  situation situation,
  adresse_allocataire json,
  date_naissance timestamp,
  exercice_id integer,
  refuser boolean default false
);

create table inscriptions (
  id serial primary key,
  beneficiaire_id integer references beneficiaires (id),
  id_etat integer,
  federation json,
  created_at timestamptz
);

-- Paris midnight of today, shifted by whole days and hours.
create function paris(jours integer, heures numeric) returns timestamptz language sql as $$
  select (date_trunc('day', now() at time zone 'Europe/Paris')
          + make_interval(days => jours, secs => heures * 3600)) at time zone 'Europe/Paris'
$$;
"""

LCA_SEED = """
-- Birthdates carry the 4-hour shift the partner pipelines apply.
insert into beneficiaires (id, genre, organisme, situation, adresse_allocataire, date_naissance, exercice_id, refuser) values
  (1, 'F',  'CAF',   'jeune',    '{"code_insee": "75056", "code_postal": "75001"}', '2015-06-01 04:00', 5, false),
  (2, 'M',  'MSA',   'AAH',      '{"code_insee": "2A004"}',                        '1998-03-10 04:00', 5, false),
  (3, 'F',  'CCMSA', 'aaeh',     '{"code_insee": " ", "code_postal": "20200"}',    '2010-12-31 04:00', 5, false),
  (4, 'M',  'CROUS', 'boursier', '{"code_insee": "97411"}',                        '2004-07-14 04:00', 5, null),
  (5, 'F',  'cnous', 'AEEH',     '{}',                                             null,               5, false),
  (6, null, 'CAF',   'jeune',    '{"code_insee": "XXXXX", "code_postal": "99999"}', '2015-01-01 04:00', 5, false),
  (7, 'F',  'CAF',   'jeune',    '{"code_insee": "75056"}',                        '2015-06-01 04:00', 5, true),
  (8, 'M',  'CAF',   'jeune',    '{"code_insee": "75056"}',                        '2015-06-01 04:00', 4, false);

insert into inscriptions (beneficiaire_id, id_etat, federation, created_at) values
  (1, 1, '{"nom": "FEDERATION FRANCAISE DE HANDBALL", "siren": "784544769"}', paris(-3, 10)),
  (1, 2, '{"nom": "FEDERATION FRANCAISE DE HANDBALL", "siren": "784544769"}', paris(-1, 9)),
  (2, 3, '{"nom": "FEDERATION FRANCAISE DE FOOTBALL"}', paris(-1, 0.5)),
  (3, 4, '{"nom": " FEDERATION FRANCAISE DE HANDBALL "}', paris(-1, 15)),
  (4, 5, '{"nom": "FEDERATION FRANCAISE DE TENNIS"}', paris(-2, 10)),
  (5, 1, '{"nom": "FEDERATION FRANCAISE DE TENNIS"}', paris(0, 8)),
  (6, 1, null, paris(-1, 12)),
  (7, 1, '{"nom": "FEDERATION FRANCAISE DE TENNIS"}', paris(-2, 10)),
  (8, 1, '{"nom": "FEDERATION FRANCAISE DE TENNIS"}', paris(-2, 10));
"""


def jour(decalage: int) -> str:
    return (datetime.now(ZoneInfo('Europe/Paris')).date() + timedelta(days=decalage)).isoformat()


@pytest.fixture(scope='module')
def pg():
    """A throwaway container with the kit, the loader and the migrations mounted read-only."""
    if shutil.which('docker') is None:
        pytest.skip('docker introuvable')
    if subprocess.run(['docker', 'info'], capture_output=True).returncode != 0:
        pytest.skip('docker indisponible')

    name = f'tableaux-de-bord-{uuid.uuid4().hex[:8]}'
    lancement = subprocess.run(
        ['docker', 'run', '--rm', '-d', '--name', name,
         '-e', 'POSTGRES_PASSWORD=test',
         '-v', f'{KIT_DIR}:/kit:ro',
         '-v', f'{TDB_DIR}:/tdb:ro',
         '-v', f'{MIGRATIONS_DIR}:/migrations:ro',
         'postgres:16'],
        capture_output=True, text=True)
    if lancement.returncode != 0:
        pytest.skip(f'conteneur postgres impossible à lancer : {lancement.stderr.strip()}')

    try:
        # The image first runs a socket-only server for its init, then restarts: only the final
        # server listens on TCP.
        for _ in range(120):
            if subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1'],
                              capture_output=True).returncode == 0:
                break
            time.sleep(0.5)
        else:
            pytest.fail('postgres ne démarre pas dans le conteneur')

        sql(name, 'postgres', 'create database lca; create database site; create role site_readonly;')
        sql(name, 'lca', LCA_SCHEMA + LCA_SEED)
        for migration in sorted(MIGRATIONS_DIR.glob('*.sql')):
            sql(name, 'site', migration.read_text())
        yield name
    finally:
        subprocess.run(['docker', 'stop', name], capture_output=True)


def sql(pg: str, base: str, script: str) -> str:
    resultat = subprocess.run(
        ['docker', 'exec', '-i', pg, 'psql', '-U', 'postgres', '-d', base,
         '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'],
        input=script, capture_output=True, text=True)
    assert resultat.returncode == 0, resultat.stderr
    return resultat.stdout


def shell(pg: str, commande: str, **env) -> subprocess.CompletedProcess:
    options = [arg for cle, valeur in env.items() for arg in ('-e', f'{cle}={valeur}')]
    return subprocess.run(['docker', 'exec', *options, pg, 'bash', '-c', commande],
                          capture_output=True, text=True)


def exporter(pg: str, base: str = 'lca') -> subprocess.CompletedProcess:
    """Runs the export script into a fresh /tmp/stats-<id> and returns the completed process."""
    destination = f'/tmp/stats-{uuid.uuid4().hex[:8]}'
    assert shell(pg, f'mkdir {destination}').returncode == 0
    resultat = shell(pg, 'bash /kit/export_dashboard.sh',
                     DESTINATION=destination, PGUSER='postgres', PGDATABASE=base)
    resultat.destination = destination
    return resultat


def lister(pg: str, dossier: str) -> list[str]:
    return shell(pg, f'ls -A {dossier}').stdout.split()


@pytest.fixture(scope='module')
def extraction(pg):
    """The directory the export script published from the seed, as a path inside the container."""
    resultat = exporter(pg)
    assert resultat.returncode == 0, resultat.stdout + resultat.stderr
    [nom] = lister(pg, resultat.destination)
    return f'{resultat.destination}/{nom}'


def lire_csv(pg: str, chemin: str) -> list[dict]:
    contenu = shell(pg, f'cat {chemin}').stdout
    return list(csv.DictReader(io.StringIO(contenu), delimiter=';'))


def lignes_du_jour(lignes: list[dict], decalage: int) -> list[dict]:
    return [ligne for ligne in lignes if ligne['jour'] == jour(decalage)]


def par_libelle(lignes: list[dict]) -> dict[str, dict]:
    return {ligne['libelle']: ligne for ligne in lignes}


# --- Export -------------------------------------------------------------------------


def test_export_publie_un_dossier_complet(pg, extraction):
    nom = extraction.rsplit('/', 1)[1]
    assert datetime.strptime(nom, '%Y-%m-%dT%H-%M-%S').date() == date.fromisoformat(jour(0))
    assert sorted(lister(pg, extraction)) == sorted(f'{t}.csv' for t in TABLEAUX)
    assert lister(pg, extraction.rsplit('/', 1)[0]) == [nom]

    for tableau in TABLEAUX:
        premiere_ligne = shell(pg, f'head -n 1 {extraction}/{tableau}.csv').stdout.rstrip('\n')
        assert premiere_ligne == ';'.join(CSV_HEADER)
        assert {ligne['tableau'] for ligne in lire_csv(pg, f'{extraction}/{tableau}.csv')} == {tableau}


def test_series_de_j3_a_j1_journee_en_cours_exclue(pg, extraction):
    for tableau in TABLEAUX:
        jours = {ligne['jour'] for ligne in lire_csv(pg, f'{extraction}/{tableau}.csv')}
        assert jours == {jour(-3), jour(-2), jour(-1)}, tableau


def test_genre(pg, extraction):
    lignes = lire_csv(pg, f'{extraction}/genre.csv')

    j1 = lignes_du_jour(lignes, -1)
    assert [ligne['libelle'] for ligne in j1] == ['Fille', 'Garçon', 'Total']
    # Eligibles count every beneficiaire, activated or not: b4 (Garçon) and b5 (Fille) too; b6,
    # without a genre, is left out.
    assert {r['libelle']: (r['eligibles'], r['codes_actives'], r['codes_actives_du_jour'],
                           r['taux_recours'], r['part_eligibles'], r['part_actives'])
            for r in j1} == {
        'Fille': ('3', '2', '1', '66.67', '60.00', '66.67'),
        'Garçon': ('2', '1', '1', '50.00', '40.00', '33.33'),
        'Total': ('5', '3', '2', '60.00', '100.00', '100.00'),
    }

    # b1's second inscription does not count it twice; J-2 has no activation at all.
    j2 = par_libelle(lignes_du_jour(lignes, -2))
    assert (j2['Fille']['codes_actives'], j2['Total']['codes_actives_du_jour']) == ('1', '0')


def test_situation(pg, extraction):
    j1 = lignes_du_jour(lire_csv(pg, f'{extraction}/situation.csv'), -1)
    assert [ligne['libelle'] for ligne in j1] == ['AEEH', 'AAH', 'QF', 'Boursiers', 'Total']
    # b5 (AEEH) is eligible but activated today only, b4 (Boursiers) by an id_etat 5 inscription
    # that does not count; b7 (refused) and b8 (exercice 4) are out.
    assert {r['libelle']: (r['eligibles'], r['codes_actives'], r['taux_recours'],
                           r['part_eligibles'], r['part_actives']) for r in j1} == {
        'AEEH': ('2', '1', '50.00', '33.33', '25.00'),
        'AAH': ('1', '1', '100.00', '16.67', '25.00'),
        'QF': ('2', '2', '100.00', '33.33', '50.00'),
        'Boursiers': ('1', '0', '0.00', '16.67', '0.00'),
        'Total': ('6', '4', '66.67', '100.00', '100.00'),
    }


def test_organisme(pg, extraction):
    j1 = lignes_du_jour(lire_csv(pg, f'{extraction}/organisme.csv'), -1)
    assert [ligne['libelle'] for ligne in j1] == ['CAF', 'MSA', 'CNOUS', 'Total']
    assert {r['libelle']: (r['eligibles'], r['codes_actives']) for r in j1} == {
        'CAF': ('2', '2'), 'MSA': ('2', '2'), 'CNOUS': ('2', '0'), 'Total': ('6', '4'),
    }


def test_region(pg, extraction):
    j1 = lignes_du_jour(lire_csv(pg, f'{extraction}/region.csv'), -1)
    assert [ligne['libelle'] for ligne in j1][-3:] == ['Non identifié', 'Autre', 'Total']
    # b2 is resolved by its INSEE code, b3 by its postal code once the blank INSEE code is dropped.
    assert {r['libelle']: (r['eligibles'], r['codes_actives'], r['part_actives']) for r in j1} == {
        'Corse': ('2', '2', '50.00'),
        'Île-de-France': ('1', '1', '25.00'),
        'La Réunion': ('1', '0', '0.00'),
        'Non identifié': ('1', '1', '25.00'),
        'Autre': ('1', '0', '0.00'),
        'Total': ('6', '4', '100.00'),
    }


def test_departement(pg, extraction):
    j1 = lignes_du_jour(lire_csv(pg, f'{extraction}/departement.csv'), -1)
    libelles = [ligne['libelle'] for ligne in j1]
    assert len(j1) == 104 + 2
    assert libelles[-2:] == ['Non renseigné', 'Total']
    assert libelles[libelles.index('Corrèze') + 1:libelles.index('Corrèze') + 4] == \
        ['Corse-du-Sud', 'Haute-Corse', "Côte-d'Or"]

    lignes = par_libelle(j1)
    assert (lignes['Corse-du-Sud']['code'], lignes['Total']['code']) == ('2A', '')
    assert {nom: (lignes[nom]['eligibles'], lignes[nom]['codes_actives'])
            for nom in ('Paris', 'Corse-du-Sud', 'Haute-Corse', 'La Réunion', 'Ain',
                        'Non renseigné', 'Total')} == {
        'Paris': ('1', '1'), 'Corse-du-Sud': ('1', '1'), 'Haute-Corse': ('1', '1'),
        'La Réunion': ('1', '0'), 'Ain': ('0', '0'),
        # b5 (no code, activated today only) and b6 (unresolvable codes, activated).
        'Non renseigné': ('2', '1'), 'Total': ('6', '4'),
    }
    assert 'Autre' not in lignes and 'Non identifié' not in lignes
    assert lignes['Ain']['taux_recours'] == ''


def test_age(pg, extraction):
    j1 = lignes_du_jour(lire_csv(pg, f'{extraction}/age.csv'), -1)
    assert [ligne['libelle'] for ligne in j1] == ['11 ans', '16 ans', '22 ans', '28 ans', 'Total']
    # b3, born 31 December 2010, is 15 today but 16 on 31 December 2026, as the eligibility
    # rules count it; b5, without a birthdate, is left out.
    assert {r['libelle']: (r['eligibles'], r['codes_actives'], r['taux_recours']) for r in j1} == {
        '11 ans': ('2', '2', '100.00'),
        '16 ans': ('1', '1', '100.00'),
        '22 ans': ('1', '0', '0.00'),
        '28 ans': ('1', '1', '100.00'),
        'Total': ('5', '4', '80.00'),
    }


def test_federation(pg, extraction):
    lignes = lire_csv(pg, f'{extraction}/federation.csv')
    j1 = lignes_du_jour(lignes, -1)
    assert [ligne['libelle'] for ligne in j1] == [
        'FEDERATION FRANCAISE DE FOOTBALL', 'FEDERATION FRANCAISE DE HANDBALL', 'Non renseigné',
        'Total']
    # b1's second inscription does not count it twice; Tennis only has an id_etat 5
    # inscription, one from today, and refused or other-exercice ones.
    assert {r['libelle']: (r['codes_actives'], r['codes_actives_du_jour'], r['part_actives'])
            for r in j1} == {
        'FEDERATION FRANCAISE DE FOOTBALL': ('1', '1', '25.00'),
        'FEDERATION FRANCAISE DE HANDBALL': ('2', '1', '50.00'),
        'Non renseigné': ('1', '1', '25.00'),
        'Total': ('4', '3', '100.00'),
    }
    assert all(r['eligibles'] == r['taux_recours'] == r['part_eligibles'] == '' for r in lignes)


def test_export_refuse_une_campagne_sans_activation(pg):
    sql(pg, 'postgres', 'create database lca_vide')
    sql(pg, 'lca_vide', LCA_SCHEMA)

    resultat = exporter(pg, base='lca_vide')

    assert resultat.returncode != 0
    assert 'ne contient aucune ligne' in resultat.stdout + resultat.stderr
    assert lister(pg, resultat.destination) == []


def test_export_purge_au_dela_de_15_jours(pg):
    destination = f'/tmp/stats-{uuid.uuid4().hex[:8]}'
    ancienne, recente, partiel = '2020-01-01T05-00-00', '2020-01-02T05-00-00', '.2020-01-03T05-00-00.partiel'
    shell(pg, f'mkdir -p {destination}/{ancienne} {destination}/{recente} {destination}/{partiel} && '
              f'touch -d "16 days ago" {destination}/{ancienne} {destination}/{partiel} && '
              f'touch -d "14 days ago" {destination}/{recente}')

    resultat = shell(pg, 'bash /kit/export_dashboard.sh',
                     DESTINATION=destination, PGUSER='postgres', PGDATABASE='lca')

    assert resultat.returncode == 0, resultat.stdout + resultat.stderr
    restants = lister(pg, destination)
    assert recente in restants and ancienne not in restants and partiel not in restants
    assert len(restants) == 2


# --- Load into the site database ----------------------------------------------------


def charger(pg: str, dossier: str, *options: str) -> subprocess.CompletedProcess:
    nom = dossier.rsplit('/', 1)[1]
    return subprocess.run(
        ['docker', 'exec', '-w', dossier, pg, 'psql', '-U', 'postgres', '-d', 'site', '-X',
         '-v', 'ON_ERROR_STOP=1', '-v', f'extraction={nom}', *options,
         '-f', '/tdb/load_dashboard.sql'],
        capture_output=True, text=True)


def compter(pg: str) -> int:
    return int(sql(pg, 'site', 'select count(*) from lca_tableaux_de_bord'))


def variante(pg: str, extraction: str, nom: str, commande: str) -> str:
    """A copy of the extraction under another name, altered by a shell command run inside it."""
    dossier = f'/tmp/variantes-{uuid.uuid4().hex[:8]}/{nom}'
    resultat = shell(pg, f'mkdir -p {dossier} && cp {extraction}/*.csv {dossier} && cd {dossier} && {commande}')
    assert resultat.returncode == 0, resultat.stderr
    return dossier


def test_chargement(pg, extraction):
    resultat = charger(pg, extraction)
    assert resultat.returncode == 0, resultat.stderr

    lignes_csv = sum(len(lire_csv(pg, f'{extraction}/{t}.csv')) for t in TABLEAUX)
    assert compter(pg) == lignes_csv == LIGNES_PAR_JOUR * 3

    # rang follows the file order; the view is what site_readonly may read.
    rangs = sql(pg, 'site', f"""
        select string_agg(libelle, '|' order by rang) from lca_tableaux_de_bord_publies
        where tableau = 'situation' and jour = '{jour(-1)}'""").strip()
    assert rangs == 'AEEH|AAH|QF|Boursiers|Total'

    nom = extraction.rsplit('/', 1)[1]
    extrait_le = sql(pg, 'site', """
        select distinct to_char(extrait_le at time zone 'Europe/Paris', 'YYYY-MM-DD"T"HH24-MI-SS')
        from lca_tableaux_de_bord""").strip()
    assert extrait_le == nom

    assert sql(pg, 'site', """
        select has_table_privilege('site_readonly', 'lca_tableaux_de_bord_publies', 'select'),
               has_table_privilege('site_readonly', 'lca_tableaux_de_bord', 'select')""").strip() == 't|f'


def test_chargement_remplace_l_extraction_precedente(pg, extraction):
    assert charger(pg, extraction).returncode == 0
    sans_j1 = variante(pg, extraction, '2099-01-01T05-00-00', f"sed -i '/{jour(-1)}/d' *.csv")

    resultat = charger(pg, sans_j1)

    assert resultat.returncode == 0, resultat.stderr
    assert compter(pg) == LIGNES_PAR_JOUR * 2
    assert sql(pg, 'site', "select distinct to_char(extrait_le at time zone 'Europe/Paris', 'YYYY')"
                           " from lca_tableaux_de_bord").strip() == '2099'

    # Loading the same extraction again is a no-op.
    assert charger(pg, sans_j1).returncode == 0
    assert compter(pg) == LIGNES_PAR_JOUR * 2


def test_dry_run_ne_change_rien(pg, extraction):
    assert charger(pg, extraction).returncode == 0
    sans_j1 = variante(pg, extraction, '2099-01-01T05-00-00', f"sed -i '/{jour(-1)}/d' *.csv")

    resultat = charger(pg, sans_j1, '-v', 'dry_run=1')

    assert resultat.returncode == 0, resultat.stderr
    assert compter(pg) == LIGNES_PAR_JOUR * 3


@pytest.mark.parametrize('commande, erreur', [
    ("sed -i '2,$d' region.csv", 'tableaux absents'),
    ("sed -n 2p genre.csv >> genre.csv", 'duplicate key'),
    ("sed -i '/Total/d' organisme.csv", 'exactement une ligne Total'),
    (f"sed -i '/{jour(-3)}/d' departement.csv", 'même plage de jours'),
])
def test_chargement_refuse_une_extraction_incoherente(pg, extraction, commande, erreur):
    assert charger(pg, extraction).returncode == 0
    avant = compter(pg)
    abimee = variante(pg, extraction, '2099-01-01T05-00-00', commande)

    resultat = charger(pg, abimee)

    assert resultat.returncode != 0
    assert erreur in resultat.stderr
    assert compter(pg) == avant
