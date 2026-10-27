"""Unit tests of dn_pipeline, the Python steps of run_dn.sh. No API, no database.

Run from data/ : source .venv/bin/activate && pytest 2026/dn-pipeline/test_dn_pipeline.py
"""

import csv
import json

import pandas as pd
import pytest
import requests

# First: it puts the partners and FranceConnect directories on sys.path.
import dn_pipeline as pipeline

import clean_fc_lib as fc  # noqa: E402
import fc_pipeline  # noqa: E402
import mapping  # noqa: E402
from dn_client import DnMutationError  # noqa: E402
from utils.data_utils import unaccent_and_upper  # noqa: E402

# The header production's /nfs/run injector expects, in this order.
PROD_HEADER = [
    'nom', 'prenom', 'date_naissance', 'genre', 'situation', 'organisme', 'allocataire',
    'adresse_allocataire', 'exercice_id', 'uuid_doc', 'zrr', 'qpv', 'a_valider', 'refuser',
    'created_at', 'updated_at', 'id_psp',
]

BOURSE = 'Bourse sur critères sociaux (CROUS)'


def champ(label, value, typename='TextChamp', **extra):
    return {'__typename': typename, 'label': label, 'stringValue': value, **extra}


def enfant(prenom='Ola', nom='Dorvat', date_naissance='2015-03-12', genre='Mme', aeeh='Oui'):
    return {'champs': [
        champ(mapping.DN_ENFANT_CHAMPS['aeeh'], aeeh, 'YesNoChamp'),
        champ(mapping.DN_ENFANT_CHAMPS['genre'], genre),
        champ(mapping.DN_ENFANT_CHAMPS['prenom'], prenom),
        champ(mapping.DN_ENFANT_CHAMPS['nom'], nom),
        champ(mapping.DN_ENFANT_CHAMPS['date_naissance'], '12 mars 2015', 'DateChamp',
              date=date_naissance),
    ]}


def traitement(event, email=None, at='2026-10-02T09:00:00+02:00'):
    return {'event': event, 'emailAgentTraitant': email, 'dateTraitement': at}


def instruction(number):
    """A dossier put en instruction by its own instructeur, I<number>."""
    return {
        'traitements': [traitement('depose', at='2026-10-01T09:00:00+02:00'),
                        traitement('passe_en_instruction', f'agent{number}@example.org')],
        'groupeInstructeur': {'instructeurs': [
            {'id': 'I-other', 'email': 'other@example.org'},
            {'id': f'I{number}', 'email': f'agent{number}@example.org'}]},
    }


def dn_dossier(number=34778465, beneficiaire_de="L'Allocation aux adultes handicapés (AAH)",
               enfants=None, foyer='Oui', enfants_aeeh='Oui', date_naissance='2000-05-04',
               caisse='CAF', caisse_enfants=None, allocataire_genre='M.', code_insee='69052',
               ine=None, **overrides):
    """`caisse` answers both caisse champs, the applicant's and the children's, unless
    `caisse_enfants` is given."""
    enfants = [enfant()] if enfants is None else enfants
    return {
        'id': f'RG9zc2llci0{number}', 'number': number, 'state': 'en_instruction',
        'connectionUsager': 'france_connect', 'deposeParUnTiers': False,
        'usager': {'email': 'pim@example.org'},
        'demandeur': {'__typename': 'PersonnePhysique', 'civilite': None, 'nom': 'Dorvat',
                      'prenom': 'Pim', 'email': None},
        'labels': [],
        'champs': [
            champ(mapping.DN_CHAMPS['allocataire_genre'], allocataire_genre),
            champ(mapping.DN_CHAMPS['adresse'], '4 place du Lac 69380 Chazay', 'AddressChamp',
                  address={'cityCode': code_insee, 'postalCode': '69380', 'cityName': 'Chazay',
                           'streetAddress': '4 place du Lac'}),
            champ(mapping.DN_CHAMPS['beneficiaire_de'], beneficiaire_de),
            champ(mapping.DN_CHAMPS['ine'], ine),
            champ(mapping.DN_CHAMPS['caisse'], caisse),
            champ(mapping.DN_CHAMPS['date_naissance'], '4 mai 2000', 'DateChamp',
                  date=date_naissance),
            champ(mapping.DN_CHAMPS['caisse_enfants'], caisse if caisse_enfants is None else caisse_enfants),
            champ(mapping.DN_CHAMPS['foyer_qf'], foyer, 'YesNoChamp'),
            champ(mapping.DN_CHAMPS['enfants_aeeh'], enfants_aeeh, 'YesNoChamp'),
            champ(mapping.DN_CHAMPS['enfants'], '', 'RepetitionChamp', rows=enfants),
        ],
        'annotations': [{'id': f'A{number}', 'label': mapping.DN_ANNOTATION_CODES, 'stringValue': None}],
        **instruction(number),
        **overrides,
    }


def child_dossier(number=34778465, child=None, **dossier):
    """A dossier claiming no direct aid: its one child is its only beneficiary."""
    return dn_dossier(number, beneficiaire_de='', enfants=[enfant(**(child or {}))], **dossier)


def raw_dn(*dossiers):
    return {'demarche': 1234, 'labels': {'traite': 'L1', 'a_verifier': 'L2', 'rejete': 'L3'},
            'dossiers': list(dossiers)}


def read(path, **kwargs) -> pd.DataFrame:
    return pd.read_csv(path, sep=';', dtype=str, keep_default_na=False, **kwargs)


def run_clean(tmp_path, dn=None):
    (tmp_path / 'dn.json').write_text(json.dumps(dn or raw_dn()))
    paths = {name: tmp_path / f'{name}.csv'
             for name in ('clean', 'match', 'cnaf', 'identities', 'rejects')}
    stats = pipeline.clean(tmp_path / 'dn.json', paths['clean'], paths['match'], paths['cnaf'],
                           paths['identities'], paths['rejects'])
    return stats, paths


# --- fetch ------------------------------------------------------------------------------

class FakeDn:
    def __init__(self, dossiers, labels=None, annotations=None):
        self._dossiers = dossiers
        self._labels = labels if labels is not None else {
            name: f'L-{key}' for key, name in mapping.DN_LABELS.items()}
        self._annotations = annotations if annotations is not None else {
            mapping.DN_ANNOTATION_CODES: {'id': 'A-codes', 'type': mapping.DN_ANNOTATION_TYPE}}
        self.calls = []
        self.refuse = {}
        # (mutation, dossier id) -> the instructeur it went out as.
        self.answered_as = {}

    def labels(self, numero):
        return self._labels

    def annotations(self, numero):
        return self._annotations

    def iter_dossiers(self, numero, state='en_instruction'):
        yield from self._dossiers

    def _call(self, name, dossier_id, *args):
        if self.refuse.get((name, dossier_id)):
            raise self.refuse[(name, dossier_id)]
        self.calls.append((name, dossier_id, *args))
        return {}

    def envoyer_message(self, dossier_id, instructeur_id, body):
        self.answered_as[('message', dossier_id)] = instructeur_id
        return self._call('message', dossier_id, body)

    def ajouter_label(self, dossier_id, label_id):
        return self._call('label', dossier_id, label_id)

    def accepter(self, dossier_id, instructeur_id, motivation):
        self.answered_as[('accepter', dossier_id)] = instructeur_id
        return self._call('accepter', dossier_id, motivation)

    def annoter(self, dossier_id, instructeur_id, annotation_id, texte):
        self.answered_as[('annotation', dossier_id)] = instructeur_id
        return self._call('annotation', dossier_id, annotation_id, texte)


def test_fetch_dn_skips_dossiers_already_labelled_by_the_pipeline():
    labelled = dn_dossier(2, labels=[{'id': 'L-traite', 'name': mapping.DN_LABELS['traite']}])
    other_label = dn_dossier(3, labels=[{'id': 'X', 'name': 'urgent'}])

    raw = pipeline.fetch_dn(FakeDn([dn_dossier(1), labelled, other_label]), 1234)

    assert [dossier['number'] for dossier in raw['dossiers']] == [1, 3]
    assert raw['labels'] == {'traite': 'L-traite', 'a_verifier': 'L-a_verifier', 'rejete': 'L-rejete'}
    assert raw['ignores'] == 1


def test_fetch_dn_takes_only_dossiers_filed_through_france_connect():
    password = dn_dossier(2, connectionUsager='password')
    deleted = dn_dossier(3, connectionUsager='deleted')
    labelled = dn_dossier(4, labels=[{'id': 'L', 'name': mapping.DN_LABELS['rejete']}])

    raw = pipeline.fetch_dn(FakeDn([dn_dossier(1), password, deleted, labelled]), 1234)

    assert [dossier['number'] for dossier in raw['dossiers']] == [1]
    assert raw['ignores'] == 3
    assert raw['ignores_par_motif'] == {'sans FranceConnect': 2, 'déjà labellisé': 1}


@pytest.mark.parametrize('overrides, reason', [
    ({}, ''),
    ({'state': 'en_construction'}, 'pas en instruction'),
    ({'connectionUsager': 'password'}, 'sans FranceConnect'),
    ({'labels': [{'id': 'L', 'name': 'à vérifier'}]}, 'déjà labellisé'),
    ({'traitements': [traitement('passe_en_instruction_automatiquement')]}, 'sans instructeur'),
])
def test_dn_skip_reason(overrides, reason):
    assert pipeline.dn_skip_reason(dn_dossier(**overrides)) == reason


def test_dn_is_answered_as_the_instructeur_who_last_put_it_en_instruction():
    dossier = dn_dossier(1, traitements=[
        traitement('passe_en_instruction', 'agent1@example.org', '2026-10-26T00:30:00+01:00'),
        traitement('repasse_en_construction', None, '2026-10-25T23:35:00+00:00'),
        # Later than the first one, though written with another offset.
        traitement('repasse_en_instruction', 'OTHER@example.org', '2026-10-25T23:45:00+00:00'),
    ])
    assert pipeline.dn_instructeur_id(dossier) == 'I-other'


@pytest.mark.parametrize('traitements', [
    # Put en instruction by DN itself, after an instructeur had done it once.
    [traitement('passe_en_instruction', 'agent1@example.org', '2026-10-02T09:00:00+02:00'),
     traitement('repasse_en_construction', None, '2026-10-03T09:00:00+02:00'),
     traitement('passe_en_instruction_automatiquement', None, '2026-10-04T09:00:00+02:00')],
    # By someone no longer in the dossier's groupe.
    [traitement('passe_en_instruction', 'gone@example.org')],
    [traitement('depose')],
    [],
])
def test_dn_without_an_instructeur_of_its_groupe_to_answer_it(traitements):
    assert pipeline.dn_instructeur_id(dn_dossier(1, traitements=traitements)) == ''


def test_fetch_dn_refuses_a_demarche_without_the_labels():
    with pytest.raises(ValueError, match='labels absents'):
        pipeline.fetch_dn(FakeDn([], labels={}), 1234)


@pytest.mark.parametrize('annotations', [
    {},
    {mapping.DN_ANNOTATION_CODES: {'id': 'A', 'type': 'TextChampDescriptor'}},
])
def test_fetch_dn_refuses_a_demarche_without_a_texte_long_codes_annotation(annotations):
    with pytest.raises(ValueError, match='Codes pass Sport'):
        pipeline.fetch_dn(FakeDn([], annotations=annotations), 1234)


# --- extraction -------------------------------------------------------------------------

def test_dn_dossier_gives_the_aah_applicant_then_each_child():
    rows = pipeline.dn_rows(raw_dn(dn_dossier(
        enfants=[enfant('Ola', aeeh='Oui'), enfant('Lio', aeeh='Non', date_naissance='2012-01-02')])))

    assert [row['reference'] for row in rows] == [
        'dn:34778465:demandeur', 'dn:34778465:enfant-1', 'dn:34778465:enfant-2']
    applicant, aeeh, jeune = rows
    assert (applicant['situation'], applicant['prenom'], applicant['date_naissance']) == (
        'AAH', 'Pim', '2000-05-04')
    assert (aeeh['situation'], aeeh['date_naissance'], aeeh['allocataire_prenom']) == (
        'AEEH', '2015-03-12', 'Pim')
    assert jeune['situation'] == 'jeune'
    # The applicant's own birthdate, on every line: they are the children's allocataire.
    assert {row['allocataire_date_naissance'] for row in rows} == {'2000-05-04'}
    assert {row['code_insee'] for row in rows} == {'69052'}
    assert {row['email'] for row in rows} == {'pim@example.org'}
    assert rows[1]['lien'] == 'https://demarche.numerique.gouv.fr/procedures/1234/dossiers/34778465'


def test_dn_keeps_the_ine_of_a_boursier_applicant_only():
    boursier, = pipeline.dn_rows(raw_dn(dn_dossier(1, beneficiaire_de=BOURSE, ine='0A1B2C3D4E5', enfants=[])))
    aah, = pipeline.dn_rows(raw_dn(dn_dossier(2, ine='0A1B2C3D4E5', enfants=[])))

    assert (boursier['situation'], boursier['ine'], boursier['allocataire_matricule']) == (
        'boursier', '0A1B2C3D4E5', '0A1B2C3D4E5')
    assert (aah['situation'], aah['ine'], aah['allocataire_matricule']) == ('AAH', '', '')


def test_dn_child_without_aeeh_outside_a_qf_household_is_rejected():
    rows = pipeline.dn_rows(raw_dn(child_dossier(foyer='Non', child={'aeeh': 'Non'})))
    assert rows[0]['situation'] == ''
    assert "ni bénéficiaire de l'AEEH" in rows[0]['motif']


@pytest.mark.parametrize('foyer, situation', [('Oui', 'jeune'), ('Non', '')])
def test_dn_child_aeeh_answer_is_ignored_once_the_foyer_answered_no_aeeh(foyer, situation):
    rows = pipeline.dn_rows(raw_dn(child_dossier(foyer=foyer, enfants_aeeh='Non', child={'aeeh': 'Oui'})))
    assert rows[0]['situation'] == situation


def test_dn_applicant_and_children_each_read_their_own_caisse():
    applicant, child = pipeline.dn_rows(raw_dn(dn_dossier(caisse='MSA', caisse_enfants='CAF')))
    assert (applicant['situation'], applicant['caisse']) == ('AAH', 'MSA')
    assert (child['situation'], child['caisse']) == ('AEEH', 'CAF')


def test_dn_children_only_option_gives_the_applicant_no_line():
    rows = pipeline.dn_rows(raw_dn(dn_dossier(
        beneficiaire_de="Seuls mes enfants sont bénéficiaires d'une aide donnant droit au Pass Sport")))
    assert [row['reference'] for row in rows] == ['dn:34778465:enfant-1']


def test_identities_carry_the_allocataire_of_each_beneficiary(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(enfants=[enfant('Ola')])))

    identities = read(paths['identities']).set_index('reference')
    columns = ['prenom', 'genre', 'allocataire_prenom', 'allocataire_nom', 'allocataire_genre']
    # The child's allocataire is the applicant; the AAH applicant is their own allocataire.
    assert identities.loc['dn:34778465:enfant-1', columns].tolist() == ['Ola', 'F', 'Pim', 'Dorvat', 'M']
    assert identities.loc['dn:34778465:demandeur', columns].tolist() == ['Pim', 'M', 'Pim', 'Dorvat', 'M']


def test_dn_children_typed_before_answering_no_children_are_ignored():
    dossier = child_dossier()
    dossier['champs'].append(champ(mapping.DN_CHAMPS['a_des_enfants'], 'Non', 'YesNoChamp', oui=False))
    rows = pipeline.dn_rows(raw_dn(dossier))
    assert [row['reference'] for row in rows] == ['dn:34778465:dossier']


@pytest.mark.parametrize('caisse, organisme', [
    ('CAF', 'CAF'), ('caf du Rhône', 'CAF'), ("Caisse d'allocations familiales", 'CAF'),
    ('MSA Ardèche', 'MSA'), ('Mutualité sociale agricole', 'MSA'),
    ('CAF ou MSA', None), ('CAFE', None), ('', None),
])
def test_caisse_is_recognised_by_keyword(caisse, organisme):
    assert mapping.organisme_of_caisse(caisse) == organisme


def test_dn_yes_no_is_read_from_the_boolean_value_too():
    child = enfant()
    child['champs'][0] = champ(mapping.DN_ENFANT_CHAMPS['aeeh'], None, 'YesNoChamp', oui=True)
    rows = pipeline.dn_rows(raw_dn(dn_dossier(beneficiaire_de='', foyer='Non', enfants=[child])))
    assert rows[0]['situation'] == 'AEEH'


def test_dn_third_party_deposit_uses_the_applicant_email_never_the_mandataire():
    dossier = dn_dossier(deposeParUnTiers=True, nomMandataire='Mandataire',
                         usager={'email': 'mandataire@example.org'})
    dossier['demandeur']['email'] = 'pim@example.org'

    rows = pipeline.dn_rows(raw_dn(dossier))

    assert {row['email'] for row in rows} == {'pim@example.org'}
    assert all('Mandataire' not in json.dumps(row) for row in rows)


def test_dn_dossier_without_beneficiary_still_yields_a_rejected_line():
    rows = pipeline.dn_rows(raw_dn(dn_dossier(beneficiaire_de='', enfants=[])))
    assert [row['reference'] for row in rows] == ['dn:34778465:dossier']
    assert 'aucun bénéficiaire' in rows[0]['motif']


# --- validate -----------------------------------------------------------------------------

@pytest.mark.parametrize('dossier, motif', [
    (child_dossier(child={'genre': 'X'}), 'genre inconnu'),
    (child_dossier(allocataire_genre='X'), 'genre du parent inconnu'),
    (child_dossier(child={'date_naissance': '31/02/2015'}), 'date de naissance illisible'),
    (child_dossier(child={'nom': ''}), 'champ vide : nom'),
    (child_dossier(usager={'email': 'pim.example.org'}), 'email invalide'),
    (child_dossier(caisse='RSI'), 'caisse inconnue'),
    (child_dossier(code_insee='123456'), 'code INSEE invalide'),
    (child_dossier(child={'date_naissance': '2021-01-01'}), 'hors fenêtre AEEH'),
    (child_dossier(child={'aeeh': 'Non', 'date_naissance': '2008-12-31'}), 'hors fenêtre jeune'),
    (dn_dossier(beneficiaire_de=BOURSE, date_naissance='1997-12-31', enfants=[]), 'hors fenêtre boursier'),
])
def test_rejects_with_a_reason(dossier, motif):
    valid, rejected = pipeline.validate(pipeline.extract(raw_dn(dossier)))
    assert valid.empty
    assert motif in rejected['motif'].iloc[0]


def test_a_boursier_without_ine_is_kept_and_matched_on_identity(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(
        beneficiaire_de=BOURSE, date_naissance='2003-05-04', enfants=[])))

    assert read(paths['rejects']).empty
    psp = read(paths['clean'], quoting=csv.QUOTE_ALL)
    assert psp['organisme'].tolist() == ['cnous']
    assert 'matricule' not in json.loads(psp['allocataire'].iloc[0])
    assert read(paths['match'])[['situation', 'ine', 'genre']].values.tolist() == [['boursier', '', 'M']]


@pytest.mark.parametrize('label, situation', [
    ("L'Allocation aux adultes handicapés (AAH)", 'AAH'),
    (BOURSE, 'boursier'),
    ('AEEH (allocation d’éducation de l’enfant handicapé)', 'AEEH'),
    ('Quotient familial inférieur ou égal à 699 €', 'jeune'),
    ('QF', 'jeune'),
    ('Autre', None),
    ('AAH ou AEEH', None),
    ('', None),
])
def test_situation_is_recognised_by_keyword(label, situation):
    assert mapping.situation_of_label(label) == situation


def test_fold_keeps_the_typographic_apostrophe():
    assert mapping.fold("Bénéficiaire de l’AEEH") == mapping.fold("Bénéficiaire de l'AEEH")


def test_parent_gender_is_optional_and_then_left_out_of_the_allocataire(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(child_dossier(allocataire_genre='')))
    row = read(paths['clean'], quoting=csv.QUOTE_ALL).iloc[0]
    assert 'qualite' not in json.loads(row['allocataire'])


def test_accepts_dates_insee_codes_and_vocabulary_in_their_usual_shapes():
    valid, rejected = pipeline.validate(pipeline.extract(raw_dn(
        child_dossier(1, child={'prenom': 'Ana', 'date_naissance': '12/03/2015', 'genre': 'Fille'},
                      code_insee='2A004'),
        child_dossier(2, child={'prenom': 'Bea', 'date_naissance': '2015-03-13'},
                      allocataire_genre='Mme', caisse='msa', code_insee=''),
    )))

    assert rejected.empty
    assert valid['date_naissance'].tolist() == ['2015-03-12', '2015-03-13']
    assert valid['allocataire_genre'].tolist() == ['M', 'F']
    assert valid['organisme'].tolist() == ['CAF', 'MSA']
    assert valid['code_insee'].tolist() == ['2A004', '']


# --- clean ------------------------------------------------------------------------------

def test_clean_writes_the_psp_schema_with_the_parent_as_allocataire(tmp_path):
    stats, paths = run_clean(tmp_path, dn=raw_dn(child_dossier(child={'prenom': 'Élyra', 'nom': 'Quistane'})))

    df = read(paths['clean'], quoting=csv.QUOTE_ALL)
    assert df.columns.tolist() == pipeline.CLEANED_COLUMNS
    row = df.iloc[0]
    assert (row['nom'], row['prenom'], row['genre']) == ('QUISTANE', 'ELYRA', 'F')
    assert row['date_naissance'] == '2015-03-12 04:00:00'
    assert (row['situation'], row['organisme']) == ('AEEH', 'CAF')
    # The applicant is the child's allocataire, their birthdate included.
    assert json.loads(row['allocataire']) == {
        'qualite': 'M', 'nom': 'DORVAT', 'prenom': 'PIM', 'courriel': 'pim@example.org',
        'date_naissance': '2000-05-04'}
    assert json.loads(row['adresse_allocataire']) == {
        'voie': '4 place du Lac', 'code_postal': '69380', 'commune': 'Chazay', 'code_insee': '69052'}
    assert stats['beneficiaires'] == 1


def test_clean_makes_the_aah_applicant_their_own_allocataire(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(enfants=[])))

    row = read(paths['clean'], quoting=csv.QUOTE_ALL).iloc[0]
    assert (row['situation'], row['organisme']) == ('AAH', 'CAF')
    assert json.loads(row['allocataire']) == {
        'qualite': 'M', 'nom': 'DORVAT', 'prenom': 'PIM', 'courriel': 'pim@example.org',
        'date_naissance': '2000-05-04'}
    assert json.loads(row['adresse_allocataire']) == {
        'voie': '4 place du Lac', 'code_postal': '69380', 'commune': 'Chazay', 'code_insee': '69052'}


def test_an_unreadable_parent_birthdate_is_left_out_without_rejecting_the_child(tmp_path):
    stats, paths = run_clean(tmp_path, dn=raw_dn(child_dossier(date_naissance='bientôt')))

    assert stats['beneficiaires'] == 1
    row = read(paths['clean'], quoting=csv.QUOTE_ALL).iloc[0]
    assert 'date_naissance' not in json.loads(row['allocataire'])


def test_clean_fills_the_cnaf_extra_field_with_the_allocataire_of_every_caf_line(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(
        dn_dossier(101, enfants=[enfant('Ola'), enfant('Lio', aeeh='Non', date_naissance='2012-01-02')]),
        child_dossier(102, child={'prenom': 'Ema'}, caisse='MSA')))

    cnaf = read(paths['cnaf']).drop(columns='eligibility_result_id')
    applicant = {'cnaf_allocataire_nom_naissance': 'DORVAT',
                 'cnaf_allocataire_date_naissance': '2000-05-04', 'cnaf_allocataire_genre': 'male'}
    # The AAH applicant is their own allocataire and their children's; MSA lines stay empty.
    assert cnaf.to_dict('records') == [applicant, applicant, applicant, {
        'cnaf_allocataire_nom_naissance': '', 'cnaf_allocataire_date_naissance': '',
        'cnaf_allocataire_genre': ''}]


def test_clean_offers_the_names_as_typed_to_the_matching(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(child_dossier(child={'prenom': 'Éla'})))

    candidates = read(paths['match'])
    assert candidates.columns.tolist() == pipeline.MATCH_COLUMNS
    assert candidates.drop(columns='eligibility_result_id').to_dict('records') == [{
        'situation': 'AEEH', 'ine': '', 'nom': 'Dorvat', 'prenom': 'Éla',
        'date_naissance': '2015-03-12', 'genre': 'F', 'allocataire_genre': 'M',
        'allocataire_nom': 'Dorvat', 'allocataire_prenom': 'Pim',
        'allocataire_date_naissance': '2000-05-04'}]


@pytest.mark.parametrize('prenom, nom, psp_prenom, psp_nom', [
    ('  élyra-Rose ', 'Quistane', 'ELYRA-ROSE', 'QUISTANE'),
    ('Ïsaac', 'Ça Ñandú', 'ISAAC', 'CA NANDU'),
    # What unaccent_and_upper does with what it cannot decompose, here as everywhere else.
    ('Zoé', 'N’Diaye', 'ZOE', 'NDIAYE'),
    ('Lœtitia', 'Cœur', 'LTITIA', 'CUR'),
])
def test_names_are_shaped_exactly_like_the_franceconnect_pipeline(tmp_path, prenom, nom, psp_prenom, psp_nom):
    dossier = child_dossier(child={'prenom': prenom, 'nom': nom})
    dossier['demandeur'].update(prenom=prenom, nom=nom)
    _, paths = run_clean(tmp_path, dn=raw_dn(dossier))

    row = read(paths['clean'], quoting=csv.QUOTE_ALL).iloc[0]
    assert (row['prenom'], row['nom']) == (psp_prenom, psp_nom)
    assert (psp_prenom, psp_nom) == (unaccent_and_upper(prenom.strip()), unaccent_and_upper(nom.strip()))
    allocataire = json.loads(row['allocataire'])
    assert (allocataire['prenom'], allocataire['nom']) == (psp_prenom, psp_nom)
    # The DN message keeps the name as typed.
    identity = read(paths['identities']).iloc[0]
    assert (identity['prenom'], identity['nom']) == (prenom.strip(), nom.strip())


def test_clean_rejects_bad_lines_without_blocking_the_others(tmp_path):
    stats, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(
        beneficiaire_de='', enfants=[enfant('Ana'), enfant('Bea', genre='X'), enfant('Cia', nom='')])))

    assert (stats['beneficiaires'], stats['lignes_rejetees']) == (1, 2)
    rejects = read(paths['rejects'])
    assert rejects.columns.tolist() == pipeline.REJECT_COLUMNS
    assert rejects['reference'].tolist() == ['dn:34778465:enfant-2', 'dn:34778465:enfant-3']


def test_clean_drops_the_same_child_seen_in_two_dossiers(tmp_path):
    stats, paths = run_clean(tmp_path, dn=raw_dn(
        child_dossier(1, child={'prenom': 'Ola', 'nom': 'Dorvat'}),
        child_dossier(2, child={'prenom': 'OLA', 'nom': 'dorvat'})))

    assert (stats['beneficiaires'], stats['doublons_du_lot']) == (1, 1)
    rejects = read(paths['rejects'])
    assert rejects.to_dict('records')[0]['motif'] == 'doublon de dn:1:enfant-1'


def test_clean_without_any_line_writes_headers_only(tmp_path):
    stats, paths = run_clean(tmp_path)
    assert stats['lignes_lues'] == 0
    assert read(paths['match']).columns.tolist() == pipeline.MATCH_COLUMNS
    assert read(paths['clean'], quoting=csv.QUOTE_ALL).empty


# --- split ------------------------------------------------------------------------------

def run_split(tmp_path, paths, correspondences):
    ids = read(paths['identities'])['eligibility_result_id'].tolist()
    lines = ['eligibility_result_id;id_psp;type'] + [
        f'{ids[index]};{code};{kind}' for index, code, kind in correspondences]
    (tmp_path / 'corr.csv').write_text('\n'.join(lines) + '\n')
    touched = ';'.join(pipeline.TOUCHED_COLUMNS) + '\n' + '\n'.join(
        f'{code};LAMP;LEA;2015-03-12;F;jeune;CAF;Mme;LAMP;ANA;1985-03-02;ana@example.org;01053;2026-09-01T10:00:00'
        for code in sorted({code for _, code, _ in correspondences}))
    (tmp_path / 'touched.csv').write_text(touched + '\n')
    out = {name: tmp_path / f'{name}.csv' for name in ('to_code', 'verdicts', 'investigation')}
    stats = pipeline.split(paths['clean'], tmp_path / 'corr.csv', tmp_path / 'touched.csv',
                           paths['identities'], paths['rejects'], out['to_code'],
                           out['verdicts'], out['investigation'])
    return ids, stats, out


def test_split_exact_is_a_doublon_close_or_same_parent_only_is_to_review_and_the_rest_is_coded(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(7, beneficiaire_de='', enfants=[
        enfant('Ana'), enfant('Bea'), enfant('Cia'), enfant('Xen', genre='X'), enfant('Dia')])))

    ids, stats, out = run_split(tmp_path, paths, [
        (0, '26-AAAA-AAAA', 'exacte'), (0, '26-BBBB-BBBB', 'proche'), (1, '26-CCCC-CCCC', 'proche'),
        (3, '26-DDDD-DDDD', 'parent')])

    assert (stats['doublons'], stats['a_verifier'], stats['a_coder'], stats['rejets']) == (1, 2, 1, 1)
    verdicts = read(out['verdicts']).set_index('reference')
    references = [f'dn:7:enfant-{index}' for index in range(1, 6)]
    assert verdicts.loc[references, 'verdict'].tolist() == [
        'doublon', 'a_verifier', 'a_coder', 'rejete', 'a_verifier']
    assert 'identiques' in verdicts.loc['dn:7:enfant-1', 'motif']
    assert 'ressemble' in verdicts.loc['dn:7:enfant-2', 'motif']
    assert 'même parent' in verdicts.loc['dn:7:enfant-5', 'motif']
    assert read(out['to_code'], quoting=csv.QUOTE_ALL)['eligibility_result_id'].tolist() == [ids[2]]

    investigation = read(out['investigation'])
    assert investigation.columns.tolist() == pipeline.INVESTIGATION_COLUMNS
    assert investigation[['reference', 'verdict', 'type', 'lamp01_id_psp']].values.tolist() == [
        ['dn:7:enfant-1', 'doublon', 'exacte', '26-AAAA-AAAA'],
        ['dn:7:enfant-1', 'doublon', 'proche', '26-BBBB-BBBB'],
        ['dn:7:enfant-2', 'a_verifier', 'proche', '26-CCCC-CCCC'],
        ['dn:7:enfant-5', 'a_verifier', 'parent', '26-DDDD-DDDD'],
    ]
    assert investigation[[
        'saisie_allocataire_nom', 'saisie_allocataire_prenom', 'saisie_allocataire_genre',
    ]].iloc[0].tolist() == ['Dorvat', 'Pim', 'M']


def test_split_a_loose_boursier_identity_is_to_review_with_its_own_reason(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(child_dossier()))

    _, stats, out = run_split(tmp_path, paths, [
        (0, '26-AAAA-AAAA', 'proche'), (0, '26-BBBB-BBBB', 'identite')])

    assert (stats['doublons'], stats['a_verifier']) == (0, 1)
    assert 'genre ou situation différents' in read(out['verdicts'])['motif'].iloc[0]


# --- whole Python chain -----------------------------------------------------------------

def test_chain_produces_the_production_drop_and_the_lamp01_file(tmp_path):
    _, paths = run_clean(tmp_path, dn=raw_dn(dn_dossier(enfants=[enfant('Lio')])))
    _, _, out = run_split(tmp_path, paths, [])
    codes = tmp_path / 'codes.csv'
    codes.write_text('code\n')

    fc_pipeline.codes.generate_codes_for_file(out['to_code'], tmp_path / 'with_codes.csv', codes)
    fc_pipeline.split_writeback(
        tmp_path / 'with_codes.csv', tmp_path / 'writeback.csv', tmp_path / 'prod.csv',
        paths['cnaf'], tmp_path / 'lamp.csv')

    prod = read(tmp_path / 'prod.csv', quoting=csv.QUOTE_ALL)
    assert prod.columns.tolist() == PROD_HEADER
    assert prod['prenom'].tolist() == ['PIM', 'LIO']
    assert read(tmp_path / 'lamp.csv', quoting=csv.QUOTE_ALL).columns.tolist() == (
        PROD_HEADER + fc.CNAF_EXTRA_FIELD_COLUMNS)
    assert sorted(read(tmp_path / 'writeback.csv')['id_psp']) == sorted(prod['id_psp'])


# --- retours ----------------------------------------------------------------------------

def code_of(eligibility_id):
    return f'26-TEST-{eligibility_id.upper()}'


def fetched_dossier(number, annotated=None, with_annotation=True):
    annotation = {'id': f'A{number}', 'label': mapping.DN_ANNOTATION_CODES, 'stringValue': annotated}
    return {'id': f'D{number}', 'number': number, 'annotations': [annotation] if with_annotation else [],
            **instruction(number)}


def write_verdicts(tmp_path, rows, annotated=None, without_annotation=()):
    """The run's verdicts, writeback.csv (a code per line to code) and fetched dossiers;
    annotated: dossier number -> what its codes annotation already holds."""
    pd.DataFrame(rows, columns=pipeline.VERDICT_COLUMNS).fillna('').to_csv(
        tmp_path / 'verdicts.csv', sep=';', index=False)
    coded = [row['eligibility_result_id'] for row in rows if row['verdict'] == 'a_coder']
    pd.DataFrame({'eligibility_result_id': coded, 'id_psp': [code_of(e) for e in coded]}).to_csv(
        tmp_path / 'writeback.csv', sep=';', index=False)
    numbers = sorted({int(row['dossier_number']) for row in rows})
    dossiers = [fetched_dossier(n, (annotated or {}).get(n), n not in without_annotation) for n in numbers]
    (tmp_path / 'dn.json').write_text(json.dumps(raw_dn(*dossiers)))


def dn_line(number, index, verdict, eligibility_id='', motif='', prenom='Ola'):
    return {'reference': f'dn:{number}:enfant-{index}',
            'dossier_id': f'D{number}', 'dossier_number': str(number),
            'eligibility_result_id': eligibility_id, 'verdict': verdict, 'motif': motif,
            'prenom': prenom, 'nom': 'Dorvat', 'email': 'pim@example.org'}


def run_retours(tmp_path, dn=None, dry_run=False, refused_drop=''):
    return pipeline.retours(tmp_path / 'verdicts.csv', tmp_path / 'writeback.csv', tmp_path / 'dn.json',
                            tmp_path / 'retours.csv', dry_run=dry_run, dn_client=dn,
                            refused_drop=refused_drop)


def test_retours_annotates_messages_labels_and_accepts_a_fully_coded_dossier(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1'), dn_line(7, 2, 'doublon', 'e2', prenom='Lio')])
    dn = FakeDn([])

    stats = run_retours(tmp_path, dn=dn)

    assert stats['dossiers_dn_acceptes'] == 1
    assert [call[:2] for call in dn.calls] == [
        ('annotation', 'D7'), ('message', 'D7'), ('label', 'D7'), ('accepter', 'D7')]
    assert dn.calls[0][2:] == ('A7', 'Ola Dorvat : 26-TEST-E1')
    message = dn.calls[1][2]
    assert 'Ola Dorvat : code pass Sport 26-TEST-E1.' in message
    assert 'Lio Dorvat : un code pass Sport a déjà été attribué.' in message
    assert dn.calls[2][2] == 'L1'


def test_retours_answers_each_dossier_as_the_instructeur_who_put_it_en_instruction(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1'), dn_line(8, 1, 'a_coder', 'e2')])
    dn = FakeDn([])

    run_retours(tmp_path, dn=dn)

    assert dn.answered_as == {
        ('annotation', 'D7'): 'I7', ('message', 'D7'): 'I7', ('accepter', 'D7'): 'I7',
        ('annotation', 'D8'): 'I8', ('message', 'D8'): 'I8', ('accepter', 'D8'): 'I8',
    }


def test_retours_appends_this_run_codes_to_the_annotation_and_never_shows_a_doublon_code(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1'), dn_line(7, 2, 'a_coder', 'e2', prenom='Lio'),
                              dn_line(7, 3, 'doublon', 'e3', prenom='Mia')],
                   annotated={7: 'Mia Dorvat : 26-OLD-0001\n'})
    dn = FakeDn([])

    run_retours(tmp_path, dn=dn)

    assert dn.calls[0][3] == 'Mia Dorvat : 26-OLD-0001\nOla Dorvat : 26-TEST-E1\nLio Dorvat : 26-TEST-E2'
    message = dn.calls[1][2]
    assert 'Lio Dorvat : code pass Sport 26-TEST-E2' in message
    assert 'Mia Dorvat : un code pass Sport a déjà été attribué.' in message
    assert '26-OLD-0001' not in message


def test_retours_stops_a_dossier_missing_the_codes_annotation(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1')], without_annotation=(7,))
    dn = FakeDn([])

    stats = run_retours(tmp_path, dn=dn)

    assert stats['erreurs'] == 1
    assert dn.calls == []
    assert 'absente du dossier' in read(tmp_path / 'retours.csv')['detail'].iloc[0]


@pytest.mark.parametrize('verdicts, label', [
    (['a_coder', 'a_verifier'], 'L2'),
    (['a_coder', 'rejete'], 'L3'),
])
def test_retours_does_not_accept_a_dossier_left_to_a_human(tmp_path, verdicts, label):
    write_verdicts(tmp_path, [dn_line(7, index, verdict, f'e{index}')
                              for index, verdict in enumerate(verdicts, start=1)])
    dn = FakeDn([])

    run_retours(tmp_path, dn=dn)

    assert [(call[0], call[-1] if call[0] == 'label' else None) for call in dn.calls] == [
        ('annotation', None), ('message', None), ('label', label)]


def test_retours_of_a_drop_refused_by_production(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1'), dn_line(7, 2, 'doublon', 'e2', prenom='Lio'),
                              dn_line(8, 1, 'doublon', 'e3')])
    dn = FakeDn([])

    stats = run_retours(tmp_path, dn=dn, refused_drop='beneficiaires-insertion-1-x.csv')

    assert (stats['refusees_par_la_production'], stats['erreurs']) == (1, 0)
    # A dossier holding a refused line gets its label only: no codes, no message, no acceptance.
    assert [call for call in dn.calls if call[1] == 'D7'] == [('label', 'D7', 'L2')]
    assert [call[0] for call in dn.calls if call[1] == 'D8'] == ['message', 'label', 'accepter']
    journal = read(tmp_path / 'retours.csv')
    assert journal[['reference', 'action', 'statut']].values.tolist() == [
        ['dn:7', 'label', 'fait'], ['dn:8', 'message', 'fait'], ['dn:8', 'label', 'fait'],
        ['dn:8', 'accepter', 'fait']]


def test_retours_replay_skips_what_was_done_and_retries_a_refused_action(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'doublon', 'e1'), dn_line(8, 1, 'doublon', 'e2')])
    dn = FakeDn([])
    dn.refuse[('label', 'D7')] = DnMutationError('label inconnu')

    first = run_retours(tmp_path, dn=dn)

    assert first['erreurs'] == 1
    assert [call[:2] for call in dn.calls] == [
        ('message', 'D7'), ('message', 'D8'), ('label', 'D8'), ('accepter', 'D8')]
    journal = read(tmp_path / 'retours.csv')
    assert 'refusé par DN : label inconnu' in journal.loc[journal['statut'] == 'erreur', 'detail'].iloc[0]

    dn.calls.clear()
    dn.refuse.clear()
    second = run_retours(tmp_path, dn=dn)

    assert second['erreurs'] == 0
    assert [call[:2] for call in dn.calls] == [('label', 'D7'), ('accepter', 'D7')]


def test_retours_never_retries_a_message_dn_did_not_answer_within_the_run(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'doublon', 'e1')])
    dn = FakeDn([])
    dn.refuse[('message', 'D7')] = requests.ReadTimeout('read timed out')

    stats = run_retours(tmp_path, dn=dn)

    assert stats['erreurs'] == 1
    assert dn.calls == []
    assert 'vérifier le dossier avant de rejouer' in read(tmp_path / 'retours.csv')['detail'].iloc[0]


def test_retours_dry_run_writes_nothing_and_journals_what_would_go_out(tmp_path):
    write_verdicts(tmp_path, [dn_line(7, 1, 'a_coder', 'e1')])

    stats = run_retours(tmp_path, dry_run=True)

    assert (stats['actions_simulees'], stats['actions_faites']) == (4, 0)
    journal = read(tmp_path / 'retours.csv')
    assert journal[['reference', 'action']].values.tolist() == [
        ['dn:7', 'annotation'], ['dn:7', 'message'], ['dn:7', 'label'], ['dn:7', 'accepter']]
    assert journal['detail'].iloc[0] == 'Ola Dorvat : 26-TEST-E1'


def test_retours_without_any_line_touches_no_dossier(tmp_path):
    write_verdicts(tmp_path, [])

    stats = run_retours(tmp_path, dn=FakeDn([]))

    assert (stats['lignes'], stats['actions_faites'], stats['erreurs']) == (0, 0, 0)
