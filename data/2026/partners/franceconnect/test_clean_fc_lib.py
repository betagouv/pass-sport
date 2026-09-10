"""Tests unitaires de clean_fc_lib, la logique propre à la source FranceConnect.

Ce qui est partagé avec les autres sources est testé un dossier plus haut, dans
../test_partners_lib.py.

Lancer depuis data/ : source .venv/bin/activate && pytest 2026/partners/franceconnect/test_clean_fc_lib.py
"""

import json

import numpy as np
import pandas as pd

import clean_fc_lib as lib


# --- Constructeurs de lignes ------------------------------------------------------
# L'export SQL a une vingtaine de colonnes : les tests ne nommeraient sinon que du bruit.

def enfant_row(**overrides):
    row = {
        'eligibility_result_id': '11111111-1111-1111-1111-111111111111',
        'source': 'enfant',
        'allocataire_fc_sub': 'sub-A',
        'allocataire-nom_naissance': 'MARTIN',
        'allocataire-nom_usage': None,
        'allocataire-prenom': 'Claire',
        'allocataire-date_naissance': '1985-03-02',
        'allocataire-genre': 'female',
        'allocataire-courriel': 'claire@example.org',
        'enfant_nom': 'MARTIN',
        'enfant_prenom': 'Lea',
        'enfant_date_naissance': '2015-06-01',
        'enfant_nom_usage': None,
        'qf_valeur': '650',
        'qf_fournisseur': 'CNAF',
        'qf_enfants': None,
        'qf_allocataires': None,
        'qf_adresse': None,
        'aah_est_beneficiaire': None,
        'crous_est_boursier': None,
        'crous_ine': None,
    }
    row.update(overrides)
    return row


def self_row(**overrides):
    row = enfant_row(
        source='self',
        enfant_nom=None,
        enfant_prenom=None,
        enfant_date_naissance=None,
        qf_valeur=None,
        qf_fournisseur=None,
        allocataire_prenom='Alex',
    )
    row.pop('allocataire_prenom')
    row.update({
        'allocataire-nom_naissance': 'BERNARD',
        'allocataire-prenom': 'Alex',
        'allocataire-date_naissance': '2000-05-05',
        'allocataire-genre': 'male',
    })
    row.update(overrides)
    return row


def situations(rows):
    """Enchaîne l'ordre d'appel imposé et renvoie (situations, compte sans situation)."""
    df = pd.DataFrame(rows)
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    df, sans_situation = lib.resolve_situation(df)
    return list(df['situation']), sans_situation


# --- resolve_situation ------------------------------------------------------------

def test_enfant_couvert_par_le_quotient_est_jeune():
    assert situations([enfant_row(qf_valeur='650', enfant_date_naissance='2015-06-01')])[0] == ['jeune']


def test_enfant_de_18_ans_sans_quotient_couvrant_passe_par_aeeh():
    # Né en 2008 : dans la fenêtre AEEH, hors fenêtre QF qui commence en 2009.
    assert situations([enfant_row(qf_valeur=None, enfant_date_naissance='2008-04-11')])[0] == ['AEEH']


def test_le_quotient_est_prioritaire_sur_aeeh_sur_les_millesimes_qui_chevauchent():
    # 2009-2020 est couvert par les deux fenêtres. QF gagne, comme dans candidates.ts —
    # c'est aussi pour cela que le worker n'appelle pas l'AEEH pour ces enfants.
    assert situations([enfant_row(qf_valeur='650', enfant_date_naissance='2009-05-05')])[0] == ['jeune']
    assert situations([enfant_row(qf_valeur='650', enfant_date_naissance='2015-06-01')])[0] == ['jeune']


def test_millesime_2009_sans_quotient_couvrant_bascule_sur_aeeh():
    assert situations([enfant_row(qf_valeur='900', enfant_date_naissance='2009-05-05')])[0] == ['AEEH']


def test_un_enfant_de_14_ans_hors_couverture_quotient_passe_par_aeeh():
    # La fenêtre AEEH est désormais celle de partners_lib (6-19 ans) : le worker interroge
    # l'AEEH pour tout enfant de la tranche que le quotient ne couvre pas.
    assert situations([enfant_row(qf_valeur='900', enfant_date_naissance='2015-06-01')])[0] == ['AEEH']


def test_un_quotient_au_seuil_bascule_l_enfant_sur_aeeh():
    # 700 pile n'ouvre pas la route QF — le seuil est strict — donc l'enfant est jugé sur
    # son propre verdict AEEH.
    assert situations([enfant_row(qf_valeur='700', enfant_date_naissance='2015-06-01')])[0] == ['AEEH']


def test_enfant_hors_fenetre_de_naissance_n_a_aucune_situation():
    # Né en 2021 : trop jeune pour QF (borne 2020-12-31) comme pour AEEH.
    resultats, sans_situation = situations([enfant_row(qf_valeur='650', enfant_date_naissance='2021-01-01')])
    assert resultats == [None]
    assert sans_situation == 1


def test_allocataire_beneficiaire_aah_est_en_situation_aah():
    assert situations([self_row(aah_est_beneficiaire='true')])[0] == ['AAH']


def test_allocataire_boursier_est_en_situation_boursier():
    assert situations([self_row(crous_est_boursier='true')])[0] == ['boursier']


def test_aah_est_prioritaire_sur_le_statut_boursier():
    row = self_row(aah_est_beneficiaire='true', crous_est_boursier='true')
    assert situations([row])[0] == ['AAH']


def test_booleen_faux_ou_absent_n_ouvre_aucun_droit():
    resultats, sans_situation = situations([
        self_row(aah_est_beneficiaire='false'),
        self_row(aah_est_beneficiaire=None),
    ])
    assert resultats == [None, None]
    assert sans_situation == 2


def test_allocataire_trop_age_pour_aah_n_a_aucune_situation():
    # Fenêtre AAH : 16-30 ans révolus, soit une naissance à partir de 1996.
    row = self_row(aah_est_beneficiaire='true', **{'allocataire-date_naissance': '1990-01-01'})
    assert situations([row])[0] == [None]


def test_boursier_de_plus_de_28_ans_n_a_aucune_situation():
    # 1998 est le dernier millésime retenu (28 ans au 31/12/2026) ; 1997 en a 29.
    assert situations([self_row(
        crous_est_boursier='true', **{'allocataire-date_naissance': '1998-12-31'})])[0] == ['boursier']
    assert situations([self_row(
        crous_est_boursier='true', **{'allocataire-date_naissance': '1997-12-31'})])[0] == [None]


def test_resolve_situation_ne_mute_pas_son_entree():
    df, _ = lib.resolve_enfant_genre(pd.DataFrame([enfant_row()]))
    df = lib.build_psp_columns(df)
    avant = df.copy()
    lib.resolve_situation(df)
    pd.testing.assert_frame_equal(df, avant)


# --- resolve_organisme ------------------------------------------------------------

def test_organisme_cnous_pour_un_boursier():
    df = pd.DataFrame([{'situation': 'boursier', 'qf_fournisseur': None}])
    assert list(lib.resolve_organisme(df)['organisme']) == ['cnous']


def test_organisme_suit_le_fournisseur_du_quotient():
    df = pd.DataFrame([
        {'situation': 'jeune', 'qf_fournisseur': 'CNAF'},
        {'situation': 'jeune', 'qf_fournisseur': 'MSA'},
    ])
    assert list(lib.resolve_organisme(df)['organisme']) == ['CAF', 'MSA']


def test_organisme_par_defaut_quand_aucun_appel_quotient_n_a_eu_lieu():
    # Cas de la route AAH : elle n'interroge que dss.allocation_adulte_handicape.
    df = pd.DataFrame([{'situation': 'AAH', 'qf_fournisseur': None}])
    assert list(lib.resolve_organisme(df)['organisme']) == ['CAF']


def test_organisme_ignore_la_casse_du_fournisseur():
    df = pd.DataFrame([{'situation': 'jeune', 'qf_fournisseur': ' msa '}])
    assert list(lib.resolve_organisme(df)['organisme']) == ['MSA']


# --- resolve_enfant_genre ---------------------------------------------------------

ENFANTS_QF = json.dumps([
    {'nom_naissance': 'MARTIN', 'prenoms': 'Lea', 'date_naissance': '01/06/2015', 'sexe': 'F'},
    {'nom_usage': 'MARTIN', 'prenoms': 'Hugo', 'date_naissance': '2008-04-11', 'sexe': 'M'},
])


def test_genre_retrouve_sur_le_nom_de_naissance_et_une_date_au_format_francais():
    df = pd.DataFrame([enfant_row(qf_enfants=ENFANTS_QF)])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert list(df['enfant_genre']) == ['F']
    assert non_resolus == 0


def test_genre_retrouve_sur_le_nom_d_usage_et_une_date_iso():
    # candidates.ts ne retient plus que le nom de naissance, mais les lignes écrites avant
    # ce changement portent un nom d'usage : l'appariement doit continuer de les retrouver.
    df = pd.DataFrame([enfant_row(
        qf_enfants=ENFANTS_QF, enfant_prenom='Hugo', enfant_date_naissance='2008-04-11')])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert list(df['enfant_genre']) == ['M']
    assert non_resolus == 0


def test_appariement_insensible_aux_accents_et_a_la_casse():
    enfants = json.dumps([
        {'nom_naissance': 'lopez', 'prenoms': 'Chloé', 'date_naissance': '2015-06-01', 'sexe': 'F'}])
    df = pd.DataFrame([enfant_row(qf_enfants=enfants, enfant_nom='LOPEZ', enfant_prenom='CHLOE')])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert list(df['enfant_genre']) == ['F']
    assert non_resolus == 0


def test_enfant_absent_de_la_reponse_quotient_est_compte_comme_non_resolu():
    df = pd.DataFrame([enfant_row(qf_enfants=ENFANTS_QF, enfant_prenom='Inconnu')])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert list(df['enfant_genre']) == ['']
    assert non_resolus == 1


def test_reponse_quotient_absente_ou_illisible_ne_leve_pas():
    df = pd.DataFrame([
        enfant_row(qf_enfants=None),
        enfant_row(qf_enfants='pas du json'),
    ])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert list(df['enfant_genre']) == ['', '']
    assert non_resolus == 2


def test_les_lignes_self_ne_sont_pas_comptees_comme_non_resolues():
    # Le genre d'un allocataire vient de son identité pivot, pas du tableau des enfants.
    df = pd.DataFrame([self_row()])
    df, non_resolus = lib.resolve_enfant_genre(df)
    assert non_resolus == 0


def test_resolve_enfant_genre_ne_mute_pas_son_entree():
    df = pd.DataFrame([enfant_row(qf_enfants=ENFANTS_QF)])
    avant = df.copy()
    lib.resolve_enfant_genre(df)
    pd.testing.assert_frame_equal(df, avant)


# --- build_psp_columns ------------------------------------------------------------

def test_une_ligne_enfant_decrit_l_enfant_et_garde_le_parent_dans_les_colonnes_allocataire():
    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)

    assert df.loc[0, 'nom'] == 'MARTIN'
    assert df.loc[0, 'prenom'] == 'Lea'
    assert df.loc[0, 'date_naissance'] == pd.Timestamp('2015-06-01')
    assert df.loc[0, 'allocataire-nom'] == 'MARTIN'
    assert df.loc[0, 'allocataire-qualite'] == 'Mme'


def test_une_ligne_self_decrit_l_allocataire_lui_meme():
    df = pd.DataFrame([self_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)

    assert df.loc[0, 'nom'] == 'BERNARD'
    assert df.loc[0, 'prenom'] == 'Alex'
    assert df.loc[0, 'genre'] == 'M'
    assert df.loc[0, 'date_naissance'] == pd.Timestamp('2000-05-05')


def test_le_parent_est_nomme_par_son_nom_de_naissance():
    # Le nom d'usage n'est plus ni demandé à FranceConnect ni exporté : il ne reste qu'un
    # seul nom possible pour l'allocataire.
    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    assert df.loc[0, 'allocataire-nom'] == 'MARTIN'


def test_un_champ_vide_du_csv_vaut_un_champ_absent():
    # Le notebook lit l'export avec keep_default_na=False : un champ non renseigné arrive en
    # chaîne vide, pas en NaN. Sans la normalisation de build_psp_columns, le sérialiseur JSON
    # porterait un courriel vide au lieu de l'écarter.
    df = pd.DataFrame([enfant_row(**{'allocataire-courriel': ''})])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    assert pd.isna(df.loc[0, 'allocataire-courriel'])


def test_l_allocataire_n_a_aucune_adresse():
    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)

    # Cette source ne porte plus aucune adresse : le parcours FranceConnect ne demande plus la
    # commune de résidence depuis que LCA en est débranché. Ces colonnes existent pour le
    # sérialiseur JSON, qui les écartera parce qu'elles sont nulles.
    for field in ('code_insee', 'voie', 'code_postal', 'commune', 'cplt_adresse'):
        assert pd.isna(df.loc[0, f'adresse_allocataire-{field}'])
    # Aucun matricule hors route boursier : la réponse quotient_familial ne porte pas de
    # numéro d'allocataire, il n'y a donc rien de vrai à mettre là.
    assert pd.isna(df.loc[0, 'allocataire-matricule'])


def test_la_cle_du_write_back_survit_a_la_projection():
    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    assert df.loc[0, 'eligibility_result_id'] == '11111111-1111-1111-1111-111111111111'


def test_un_genre_inconnu_devient_nul_et_fera_ecarter_la_ligne():
    df = pd.DataFrame([self_row(**{'allocataire-genre': None})])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    assert pd.isna(df.loc[0, 'genre'])


def test_build_psp_columns_ne_mute_pas_son_entree():
    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    avant = df.copy()
    lib.build_psp_columns(df)
    pd.testing.assert_frame_equal(df, avant)


# --- drop_intermediate_columns ----------------------------------------------------

def test_il_ne_reste_que_le_schema_psp_et_la_cle_du_write_back():
    import partners_lib as partners

    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    df, _ = lib.resolve_situation(df)
    df = lib.resolve_organisme(df)
    df = partners.add_allocataire_json_column(df)
    df = partners.add_adresse_allocataire_json_column(df)
    df = lib.drop_intermediate_columns(df)

    assert sorted(df.columns) == sorted([
        'eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'genre',
        'organisme', 'situation', 'allocataire', 'adresse_allocataire',
    ])


def test_les_colonnes_json_portent_ce_que_franceconnect_donne_et_rien_de_plus():
    import partners_lib as partners

    df = pd.DataFrame([enfant_row()])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    df = partners.add_allocataire_json_column(df)
    df = partners.add_adresse_allocataire_json_column(df)

    allocataire = json.loads(df.loc[0, 'allocataire'])
    adresse = json.loads(df.loc[0, 'adresse_allocataire'])

    assert allocataire == {
        'qualite': 'Mme', 'nom': 'MARTIN', 'prenom': 'CLAIRE', 'courriel': 'claire@example.org',
    }
    # Ni code_organisme, ni téléphone, ni matricule : FranceConnect n'en fournit aucun — la
    # réponse quotient_familial ne porte aucun numéro d'allocataire — et le sérialiseur écarte
    # les valeurs nulles plutôt que de les porter vides. Seule la route boursier a un
    # matricule, l'INE (voir build_psp_columns).
    assert adresse == {}


def test_drop_intermediate_columns_tolere_les_colonnes_deja_absentes():
    # filter_rows_missing_required_fields supprime en amont les colonnes entièrement nulles.
    df = pd.DataFrame([{'eligibility_result_id': 'x', 'nom': 'MARTIN', 'source': 'enfant'}])
    assert list(lib.drop_intermediate_columns(df).columns) == ['eligibility_result_id', 'nom']


# --- Rapprochement avec la base bénéficiaires -------------------------------------

# Le foyer tel que la CAF l'écrit : nom de naissance ET nom d'usage, que le pivot
# FranceConnect ne donne plus depuis le retrait de preferred_username. Deux allocataires,
# comme pour un couple — c'est la date de naissance du pivot qui désigne le connecté.
ALLOCATAIRES_QF = json.dumps([
    {'nom_naissance': 'BOLIMEK', 'nom_usage': 'MARTIN', 'prenoms': 'Claire Ysolde',
     'date_naissance': '02/03/1985', 'sexe': 'F'},
    {'nom_naissance': 'VOKTARIMENDO', 'prenoms': 'Tarnu',
     'date_naissance': '17/11/1982', 'sexe': 'M'},
])


def test_l_allocataire_caf_est_choisi_sur_la_date_de_naissance_du_pivot():
    df = pd.DataFrame([enfant_row(qf_allocataires=ALLOCATAIRES_QF)])
    df, non_resolus = lib.resolve_allocataire_caf(df)

    assert non_resolus == 0
    assert df.loc[0, 'match-allocataire_nom_naissance'] == 'BOLIMEK'
    assert df.loc[0, 'match-allocataire_nom_usage'] == 'MARTIN'
    assert df.loc[0, 'match-allocataire_prenom'] == 'CLAIRE YSOLDE'


def test_l_allocataire_caf_retombe_sur_le_pivot_sans_reponse_quotient_familial():
    # C'est le cas de la route AAH, qui n'appelle jamais quotient_familial : il n'y a aucun
    # tableau `allocataires`, et l'état civil du pivot est tout ce qu'on a.
    df = pd.DataFrame([enfant_row()])
    df, non_resolus = lib.resolve_allocataire_caf(df)

    assert non_resolus == 1
    assert df.loc[0, 'match-allocataire_nom_naissance'] == 'MARTIN'
    assert df.loc[0, 'match-allocataire_prenom'] == 'Claire'


def test_un_seul_allocataire_est_retenu_sans_date_de_naissance_concordante():
    seul = json.dumps([{'nom_naissance': 'ZELVIK', 'prenoms': 'Halvi',
                        'date_naissance': '01/01/1900'}])
    df = pd.DataFrame([enfant_row(qf_allocataires=seul)])
    df, non_resolus = lib.resolve_allocataire_caf(df)

    assert non_resolus == 0
    assert df.loc[0, 'match-allocataire_nom_naissance'] == 'ZELVIK'


def test_deux_allocataires_sans_date_concordante_ne_designent_personne():
    ambigu = json.dumps([
        {'nom_naissance': 'ZELVIK', 'prenoms': 'Halvi', 'date_naissance': '01/01/1900'},
        {'nom_naissance': 'OSVAREK', 'prenoms': 'Mirsa', 'date_naissance': '02/02/1901'},
    ])
    df = pd.DataFrame([enfant_row(qf_allocataires=ambigu)])
    df, non_resolus = lib.resolve_allocataire_caf(df)

    # Non résolu côté CAF : le repli sur le pivot rend quand même la ligne recherchable.
    assert non_resolus == 1
    assert df.loc[0, 'match-allocataire_nom_naissance'] == 'MARTIN'


def test_le_code_postal_du_foyer_est_extrait_de_la_reponse_quotient_familial():
    df = pd.DataFrame([enfant_row(qf_adresse=json.dumps({'code_postal': '88180',
                                                         'commune': 'PLUNDARIS'}))])
    df = lib.resolve_adresse_qf(df)
    assert df.loc[0, 'match-code_postal'] == '88180'


def test_l_ine_du_boursier_devient_le_matricule_de_l_allocataire():
    df = pd.DataFrame([self_row(crous_est_boursier='true', crous_ine='INE7788')])
    df, _ = lib.resolve_enfant_genre(df)
    df = lib.build_psp_columns(df)
    assert df.loc[0, 'allocataire-matricule'] == 'INE7788'


def test_les_candidats_au_rapprochement_portent_les_colonnes_attendues():
    import partners_lib as partners

    df = pd.DataFrame([enfant_row(qf_allocataires=ALLOCATAIRES_QF)])
    df, _ = lib.resolve_enfant_genre(df)
    df, _ = lib.resolve_allocataire_caf(df)
    df = lib.resolve_adresse_qf(df)
    df = lib.build_psp_columns(df)
    df = partners.add_allocataire_json_column(df)

    candidats = lib.build_match_candidates(df)

    assert list(candidats.columns) == lib.MATCH_COLUMNS
    assert candidats.loc[0, 'allocataire_nom'] == 'BOLIMEK'
    assert candidats.loc[0, 'beneficiaire_nom'] == 'MARTIN'
    assert candidats.loc[0, 'beneficiaire_prenom'] == 'Lea'
    assert candidats.loc[0, 'beneficiaire_date_naissance'] == '2015-06-01'
    # Pas de route boursier ici : aucun INE, donc aucune jointure exacte à tenter.
    assert candidats.loc[0, 'ine'] == ''


# --- Noms d'usage ------------------------------------------------------------------

# Le foyer tel que la CAF l'écrit pour ses enfants : la même entrée donne le genre et le nom
# d'usage, retrouvée par nom de naissance, prénoms et date.
ENFANTS_QF_AVEC_USAGE = json.dumps([
    {'nom_naissance': 'MARTIN', 'nom_usage': 'ZALQUIN', 'prenoms': 'Lea',
     'date_naissance': '01/06/2015', 'sexe': 'F'},
])


def noms_d_usage(row):
    """Enchaîne les résolutions dans l'ordre de fc_pipeline.clean."""
    df = pd.DataFrame([row])
    df, _ = lib.resolve_enfant_genre(df)
    df, _ = lib.resolve_allocataire_caf(df)
    df = lib.resolve_beneficiaire_nom_usage(df)
    return df.loc[0, 'match-allocataire_nom_usage'], df.loc[0, 'match-beneficiaire_nom_usage']


def test_sans_reponse_qf_le_nom_d_usage_de_l_allocataire_vient_de_franceconnect():
    # Route AAH : aucun appel quotient_familial, donc aucun tableau `allocataires`. Le
    # preferred_username FranceConnect est alors le seul nom d'usage disponible — et c'est un
    # nom d'usage que la CNAF range dans RESPDOS.
    allocataire, _ = noms_d_usage(self_row(aah_est_beneficiaire='true',
                                           **{'allocataire-nom_usage': 'Vorsalde'}))
    assert allocataire == 'Vorsalde'


def test_le_nom_d_usage_de_la_caf_prime_sur_celui_de_franceconnect():
    # La base cherchée porte l'orthographe de la caisse : autant la préférer quand on l'a.
    allocataire, _ = noms_d_usage(enfant_row(qf_allocataires=ALLOCATAIRES_QF,
                                             **{'allocataire-nom_usage': 'Vorsalde'}))
    assert allocataire == 'MARTIN'


def test_le_nom_d_usage_de_l_enfant_vient_de_enfant_identite():
    _, beneficiaire = noms_d_usage(enfant_row(enfant_nom_usage='Bravenne',
                                              qf_enfants=ENFANTS_QF_AVEC_USAGE))
    assert beneficiaire == 'Bravenne'


def test_sans_nom_d_usage_stocke_celui_de_l_enfant_est_repris_de_qf_enfants():
    # Lignes écrites avant que le worker ne stocke enfant_identite.preferred_username : la
    # réponse quotient_familial le porte toujours.
    _, beneficiaire = noms_d_usage(enfant_row(qf_enfants=ENFANTS_QF_AVEC_USAGE))
    assert beneficiaire == 'ZALQUIN'


def test_sur_une_ligne_self_le_beneficiaire_porte_le_nom_d_usage_de_l_allocataire():
    # Le bénéficiaire EST l'allocataire : une seule valeur sert les deux moitiés de la clé.
    allocataire, beneficiaire = noms_d_usage(self_row(**{'allocataire-nom_usage': 'Vorsalde'}))
    assert beneficiaire == allocataire == 'Vorsalde'


def test_sans_aucun_nom_d_usage_la_variante_reste_vide():
    allocataire, beneficiaire = noms_d_usage(enfant_row())
    assert (allocataire, beneficiaire) == ('', '')


def test_les_candidats_portent_le_genre_la_qualite_et_les_noms_d_usage():
    import partners_lib as partners

    df = pd.DataFrame([enfant_row(qf_enfants=ENFANTS_QF_AVEC_USAGE,
                                  **{'allocataire-nom_usage': 'Vorsalde'})])
    df, _ = lib.resolve_enfant_genre(df)
    df, _ = lib.resolve_allocataire_caf(df)
    df = lib.resolve_adresse_qf(df)
    df = lib.resolve_beneficiaire_nom_usage(df)
    df = lib.build_psp_columns(df)
    df = partners.add_allocataire_json_column(df)

    candidats = lib.build_match_candidates(df)

    assert list(candidats.columns) == lib.MATCH_COLUMNS
    assert candidats.loc[0, 'allocataire_nom_usage'] == 'Vorsalde'
    assert candidats.loc[0, 'beneficiaire_nom_usage'] == 'ZALQUIN'
    assert candidats.loc[0, 'beneficiaire_genre'] == 'F'
    assert candidats.loc[0, 'allocataire_qualite'] == 'Mme'
