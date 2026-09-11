"""Logique propre à la source FranceConnect, pour clean_franceconnect.ipynb.

Cette « source » n'est pas un fichier partenaire mais un export de la table
`eligibility_results` du worker (voir export_eligible_pending.sql et README.md) : les
personnes que le site a jugées éligibles sans que LCA ait pu leur servir un code. Tout ce
qu'elle partage avec CNAF/MSA/CNOUS — fenêtres d'éligibilité, sérialisation JSON,
déduplication — vit un dossier plus haut, dans partners_lib.py. Ne reste ici que ce que seule
cette source impose, et qui tient en trois manques du schéma :

  1. `eligibility_results` ne mémorise pas QUELLE aide a rendu la personne éligible : la
     colonne `situation` doit être reconstruite depuis les réponses brutes d'API Particulier
     conservées dans `eligibility_history` (resolve_situation, resolve_organisme) ;
  2. `enfant_identite` ne porte ni genre ni sexe, alors que `genre` est obligatoire : il faut
     aller le rechercher dans le tableau `enfants` de la réponse quotient_familial
     (resolve_enfant_genre) ;
  3. l'identité arrive au vocabulaire FranceConnect (family_name/given_name/gender) et
     répartie sur deux colonnes JSON selon `source`, quand le schéma PSP attend
     nom/prenom/genre à plat (build_psp_columns).

Les règles reproduites ici sont celles du worker, et doivent le rester : les fenêtres de
naissance et le seuil de quotient viennent de partners_lib (donc de worker/src/eligibility/
types.ts), et l'attribution des routes suit worker/src/lca/candidates.ts.

Fonctions pures : elles prennent un DataFrame (plus des paramètres explicites) et en
renvoient un nouveau, sans jamais muter leur entrée ni toucher au système de fichiers ou à
os.environ. Les étapes qui comptaient quelque chose renvoient ce compte, à charge du
notebook de l'afficher.

L'ordre d'appel est contraint, chaque étape consommant la précédente :

    resolve_enfant_genre  ->  build_psp_columns  ->  resolve_situation  ->  resolve_organisme

build_psp_columns a besoin du genre des enfants ; resolve_situation a besoin de la
`date_naissance` du bénéficiaire, que seul build_psp_columns sait choisir entre les deux
identités ; resolve_organisme a besoin de la `situation`.

Voir test_clean_fc_lib.py pour les tests unitaires.
"""

import json
from datetime import datetime

import numpy as np
import pandas as pd

import partners_lib as partners
from utils.data_utils import unaccent_and_upper

# --- Vocabulaire FranceConnect -> vocabulaire PSP ---------------------------------

# `gender` est l'OIDC "male"/"female" de FranceConnect (site/.../pivot.ts), déjà narrowé à
# ces deux valeurs. Tout le reste (absent, vide) donne NaN et fera écarter la ligne par
# partners.filter_rows_missing_required_fields, `genre` étant obligatoire.
GENRE_BY_GENDER = {'male': 'M', 'female': 'F'}
QUALITE_BY_GENDER = {'male': 'M', 'female': 'Mme'}

# `sexe` du tableau `enfants` de quotient_familial : déjà au format PSP.
GENRE_BY_SEXE = {'M': 'M', 'F': 'F'}

# Route CROUS : jusqu'à 28 ans à la date de référence de la campagne (2026-12-31, cf.
# AGE_REFERENCE_DATE dans worker/src/lca/candidates.ts), soit né à partir du 01/01/1998.
# Pas de borne haute : c'est le statut boursier, vérifié par API Particulier, qui ferme
# l'autre bout. Ce sont les bornes CROUS_BIRTHDATE_MIN/MAX de
# worker/src/eligibility/types.ts, celles qui ont réellement produit les verdicts rejoués ici.
CROUS_DOB_MIN = datetime(1998, 1, 1)

# Fournisseur du quotient familial -> organisme PSP. Le champ vient de la réponse
# quotient_familial et dit quelle caisse a servi la donnée.
ORGANISME_BY_FOURNISSEUR = {'CNAF': 'CAF', 'CAF': 'CAF', 'MSA': 'MSA'}

# Organisme retenu quand aucun appel quotient_familial n'a eu lieu — c'est le cas de la
# route AAH, qui n'interroge que dss.allocation_adulte_handicape.
DEFAULT_ORGANISME = 'CAF'

ORGANISME_BOURSIER = 'cnous'

# Déduplication : identité seule, volontairement plus étroite que
# partners.DEDUPLICATION_KEY_COLUMNS. Un même enfant peut être remonté par ses DEUX parents,
# chacun avec son propre sub et son propre courriel ; garder ces colonnes dans la clé
# laisserait passer deux lignes, donc deux codes, pour un seul bénéficiaire. Les colonnes
# allocataire-matricule / -code_organisme / -telephone du jeu partenaire n'existent de toute
# façon pas ici : FranceConnect n'en fournit aucune.
FC_DEDUPLICATION_KEY_COLUMNS = ['nom', 'prenom', 'date_naissance', 'genre']

# Tout ce qui doit disparaître avant l'écriture du CSV destiné à la génération de codes :
# les colonnes de travail de l'export, et la charpente `allocataire-*` / `adresse_*` une fois
# repliée dans les deux colonnes JSON. Équivalent de partners.FINAL_COLUMNS_TO_DROP, qui ne
# peut pas être réutilisé tel quel : cette source nomme ses colonnes d'identité au vocabulaire
# FranceConnect, n'a de matricule que sur la route boursier (l'INE) et aucune adresse postale.
#
# Les colonnes brutes que le rapprochement exploite (qf_allocataires, crous_ine)
# sont retirées ici comme les autres colonnes de travail : leur contenu utile a déjà été
# extrait. Les colonnes `match-*` qui en dérivent, elles, ne figurent PAS dans cette liste :
# ce retrait précède le filtrage et la déduplication, alors que les candidats au rapprochement
# doivent être tirés du DataFrame final. fc_pipeline.clean les retire à part.
#
# `eligibility_result_id` n'en fait volontairement PAS partie : c'est la clé du write-back,
# elle doit survivre jusqu'au CSV final (voir writeback_codes.ipynb). Après ce retrait, il
# reste exactement les colonnes du schéma PSP :
#   eligibility_result_id, nom, prenom, date_naissance, genre, organisme, situation,
#   allocataire, adresse_allocataire
FINAL_COLUMNS_TO_DROP = [
    # colonnes de travail de l'export SQL
    'source',
    'created_at',
    'allocataire_fc_sub',
    'enfant_nom',
    'enfant_prenom',
    'enfant_date_naissance',
    'enfant_genre',
    'qf_valeur',
    'qf_fournisseur',
    'qf_enfants',
    'qf_allocataires',
    'aah_est_beneficiaire',
    'crous_est_boursier',
    'crous_ine',
    # noms d'usage servis par FranceConnect (preferred_username), déjà repris dans les
    # colonnes `match-*` par resolve_allocataire_caf et resolve_beneficiaire_nom_usage
    'allocataire-nom_usage',
    'enfant_nom_usage',
    # charpente repliée dans la colonne JSON `allocataire`
    'allocataire-qualite',
    'allocataire-matricule',
    'allocataire-code_organisme',
    'allocataire-telephone',
    'allocataire-nom',
    'allocataire-prenom',
    'allocataire-courriel',
    'allocataire-nom_naissance',
    'allocataire-date_naissance',
    'allocataire-genre',
    'allocataire-code_insee_naissance',
    'allocataire-code_pays_naissance',
    # charpente repliée dans la colonne JSON `adresse_allocataire`
    'adresse_allocataire-voie',
    'adresse_allocataire-code_postal',
    'adresse_allocataire-commune',
    'adresse_allocataire-code_insee',
    'adresse_allocataire-cplt_adresse',
]


def _to_iso_birthdate(value) -> str:
    """Normalise une date d'API Particulier ('JJ/MM/AAAA' ou ISO) en 'AAAA-MM-JJ'.

    Même normalisation que toIsoDate dans worker/src/lca/candidates.ts : les deux formats
    cohabitent dans les réponses quotient_familial.
    """
    if not isinstance(value, str):
        return ''

    value = value.strip()
    if len(value) == 10 and value[2] == '/' and value[5] == '/':
        return f"{value[6:]}-{value[3:5]}-{value[0:2]}"
    if len(value) >= 10 and value[4] == '-' and value[7] == '-':
        return value[:10]
    return ''


def _is_true(series: pd.Series) -> pd.Series:
    """Booléen JSON exporté en texte par psql ('true'/'false'/vide) -> booléen pandas."""
    return series.fillna('').astype(str).str.strip().str.lower() == 'true'


def _birthdate_within(birthdates: pd.Series, dob_min: datetime, dob_max: datetime = None) -> pd.Series:
    """Masque « né dans la fenêtre », bornes incluses. dob_max=None = pas de borne haute."""
    dob = pd.to_datetime(birthdates, errors='coerce')
    within = dob >= dob_min
    if dob_max is not None:
        within &= dob <= dob_max
    return within.fillna(False)


def resolve_situation(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Reconstruit la colonne `situation` — quelle aide rend cette personne éligible.

    `eligibility_results` ne la mémorise pas : elle ne retient que `source` (self/enfant) et
    un booléen d'éligibilité. La route se redéduit des réponses brutes d'API Particulier,
    exactement comme listBeneficiaryCandidates le fait dans worker/src/lca/candidates.ts.

    À appeler APRÈS build_psp_columns : la fenêtre de naissance porte sur le bénéficiaire de
    la ligne, dont la date de naissance vient de `enfant_identite` ou de
    `allocataire_identite` selon `source`. C'est build_psp_columns qui résout ce choix, dans
    la colonne `date_naissance`.

    Renvoie (df, nombre de lignes sans situation). Ces lignes-là gardent NaN et seront
    écartées plus loin par partners.filter_rows_missing_required_fields.
    """
    df = df.copy()

    dob = df['date_naissance']
    is_enfant = df['source'] == 'enfant'
    quotient = pd.to_numeric(df['qf_valeur'], errors='coerce')

    # Route QF : le quotient du foyer passe sous le seuil et l'enfant est dans la fenêtre
    # 6-17 ans. Strictement inférieur — 700 pile n'ouvre aucun droit.
    qf_covers = quotient < partners.QF_MAX
    jeune = is_enfant & qf_covers & _birthdate_within(dob, partners.QF_DOB_MIN, partners.QF_DOB_MAX)

    # Route AEEH : 6-19 ans, pour les enfants que le quotient ne couvre pas. Les deux fenêtres
    # se chevauchent sur tout 2009-2020 et QF y est prioritaire — d'où le `& ~jeune`, qui
    # reproduit le `else if` de candidates.ts et, côté worker, le filtre de planChildrenChecks.
    aeeh = is_enfant & ~jeune & _birthdate_within(
        dob, partners.AEEH_DOB_MIN, partners.AEEH_DOB_MAX)

    # Routes de l'allocataire lui-même.
    aah = ~is_enfant & _is_true(df['aah_est_beneficiaire']) & _birthdate_within(
        dob, partners.AAH_DOB_MIN, partners.AAH_DOB_MAX)
    boursier = ~is_enfant & _is_true(df['crous_est_boursier']) & _birthdate_within(dob, CROUS_DOB_MIN)

    # AAH l'emporte quand les deux sont vrais. candidates.ts n'ordonne pas les deux aides
    # (il les cumule dans `eligibilities`), mais une ligne PSP ne porte qu'une `situation` :
    # AAH est retenue parce que c'est un droit permanent, là où le statut boursier se
    # renouvelle chaque année.
    df['situation'] = np.select(
        [jeune, aeeh, aah, boursier],
        ['jeune', 'AEEH', 'AAH', 'boursier'],
        default=None,
    )

    return df, int(df['situation'].isna().sum())


def resolve_organisme(df: pd.DataFrame) -> pd.DataFrame:
    """Renseigne `organisme` : la caisse d'où vient le droit.

    'cnous' pour les boursiers ; sinon le fournisseur annoncé par la réponse
    quotient_familial (CNAF -> CAF, MSA -> MSA) ; sinon DEFAULT_ORGANISME, cas de la route
    AAH qui n'a déclenché aucun appel quotient_familial et n'a donc pas de fournisseur.
    """
    df = df.copy()

    fournisseur = (
        df['qf_fournisseur'].fillna('').astype(str).str.strip().str.upper()
        .map(ORGANISME_BY_FOURNISSEUR).fillna(DEFAULT_ORGANISME)
    )

    df['organisme'] = np.where(df['situation'] == 'boursier', ORGANISME_BOURSIER, fournisseur)
    return df


def _texte(valeur) -> str:
    """Une cellule en texte nu : '' pour None, NaN ou une chaîne vide.

    `str(valeur or '')` ne suffit pas : un NaN est vrai en contexte booléen, et deviendrait
    la chaîne 'nan'.
    """
    if valeur is None or (isinstance(valeur, float) and np.isnan(valeur)):
        return ''
    return str(valeur).strip()


def _entree_qf_de_l_enfant(row):
    """L'entrée du tableau `enfants` de quotient_familial qui décrit l'enfant de la ligne.

    Appariement sur (nom, prénoms, date de naissance), le nom pouvant être le nom de naissance
    comme le nom d'usage : candidates.ts ne retient plus que le nom de naissance, mais les
    lignes écrites avant ce changement portent un nom d'usage. None sur une ligne 'self', sans
    réponse lisible, ou sans entrée concordante.

    Partagée par resolve_enfant_genre (le sexe) et resolve_beneficiaire_nom_usage (le nom
    d'usage), pour que les deux lisent la MÊME entrée.
    """
    if row['source'] != 'enfant':
        return None

    try:
        enfants = json.loads(row['qf_enfants']) if row['qf_enfants'] else []
    except (TypeError, ValueError):
        return None
    if not isinstance(enfants, list):
        return None

    cible = (
        unaccent_and_upper(_texte(row['enfant_nom'])),
        unaccent_and_upper(_texte(row['enfant_prenom'])),
        _to_iso_birthdate(row['enfant_date_naissance']),
    )

    for enfant in enfants:
        if not isinstance(enfant, dict):
            continue
        prenoms = unaccent_and_upper(_texte(enfant.get('prenoms')))
        naissance = _to_iso_birthdate(enfant.get('date_naissance'))
        for cle_nom in ('nom_naissance', 'nom_usage'):
            nom = unaccent_and_upper(_texte(enfant.get(cle_nom)))
            if nom and (nom, prenoms, naissance) == cible:
                return enfant

    return None


def resolve_enfant_genre(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Retrouve le genre des enfants dans le tableau `enfants` de quotient_familial.

    `enfant_identite` ne porte ni genre ni sexe, alors que `genre` est une colonne
    obligatoire. La réponse brute quotient_familial, elle, le porte — d'où l'appariement de
    l'enfant dans ce tableau (_entree_qf_de_l_enfant).

    Renvoie (df, nombre d'enfants non appariés). Ceux-là gardent un genre vide et seront
    écartés plus loin ; un compte non nul mérite un coup d'œil, il signale un décalage
    entre l'identité persistée et la réponse d'origine.
    """
    df = df.copy()

    def genre_for(row) -> str:
        enfant = _entree_qf_de_l_enfant(row)
        if enfant is None:
            return ''
        return GENRE_BY_SEXE.get(_texte(enfant.get('sexe')).upper(), '')

    df['enfant_genre'] = '' if df.empty else df.apply(genre_for, axis=1)

    non_resolus = int(((df['source'] == 'enfant') & (df['enfant_genre'] == '')).sum())
    return df, non_resolus


def resolve_allocataire_caf(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Retrouve l'allocataire tel que la CAF ou la MSA l'écrit, dans `qf_allocataires`.

    Sert au rapprochement avec la base bénéficiaires, et à rien d'autre : les lignes CNAF et
    MSA de cette base portent l'orthographe du fichier partenaire, pas celle de l'état civil.
    Le pivot FranceConnect donne l'état civil (`family_name`) et, quand le fournisseur
    d'identité en sert un, le nom d'usage (`preferred_username`). Le tableau `allocataires`
    de la réponse quotient_familial porte les deux, et c'est lui qu'on préfère : c'est la même
    caisse, le même système d'information que l'export partenaire qu'on cherche à retrouver.
    Le pivot n'est qu'un repli.

    Le tableau peut décrire un couple. L'allocataire connecté est celui dont la date de
    naissance est celle du pivot ; à défaut, un tableau à une seule entrée ne laisse aucun
    doute. Sinon les colonnes restent vides et le rapprochement retombera sur le pivot.

    Renvoie (df, nombre de lignes sans allocataire CAF identifié).
    """
    df = df.copy()

    def allocataire_for(row) -> tuple[str, str, str]:
        try:
            brut = row.get('qf_allocataires')
            allocataires = json.loads(brut) if brut else []
        except (TypeError, ValueError):
            return '', '', ''

        if not isinstance(allocataires, list) or not allocataires:
            return '', '', ''

        naissance_pivot = _to_iso_birthdate(row.get('allocataire-date_naissance'))
        retenu = None
        if naissance_pivot:
            for allocataire in allocataires:
                if _to_iso_birthdate(allocataire.get('date_naissance')) == naissance_pivot:
                    retenu = allocataire
                    break
        if retenu is None and len(allocataires) == 1:
            retenu = allocataires[0]
        if retenu is None:
            return '', '', ''

        return (
            unaccent_and_upper(str(retenu.get('nom_naissance') or '')).strip(),
            unaccent_and_upper(str(retenu.get('nom_usage') or '')).strip(),
            unaccent_and_upper(str(retenu.get('prenoms') or '')).strip(),
        )

    if df.empty:
        caf_nom = caf_nom_usage = caf_prenom = pd.Series('', index=df.index, dtype=object)
    else:
        resolus = df.apply(allocataire_for, axis=1, result_type='expand')
        caf_nom, caf_nom_usage, caf_prenom = resolus[0], resolus[1], resolus[2]

    non_resolus = int((caf_nom == '').sum())

    # Repli sur l'état civil du pivot, fait ICI et pas au moment de construire le CSV de
    # rapprochement : `allocataire-nom_naissance` et `-prenom` sont de la charpente, que
    # drop_intermediate_columns aura retirée d'ici là.
    pivot_nom = df['allocataire-nom_naissance'].fillna('') \
        if 'allocataire-nom_naissance' in df.columns else pd.Series('', index=df.index)
    pivot_prenom = df['allocataire-prenom'].fillna('') \
        if 'allocataire-prenom' in df.columns else pd.Series('', index=df.index)
    pivot_nom_usage = df['allocataire-nom_usage'].fillna('') \
        if 'allocataire-nom_usage' in df.columns else pd.Series('', index=df.index)

    df['match-allocataire_nom_naissance'] = caf_nom.where(caf_nom != '', pivot_nom)
    # Nom d'usage : celui de la caisse d'abord, à défaut celui que FranceConnect a servi. Sans
    # l'un ni l'autre la colonne reste vide et les stratégies CAF, qui comparent ce nom-là,
    # ne retournent rien — le fabriquer depuis l'état civil ne donnerait que le nom de
    # naissance sous une étiquette mensongère.
    df['match-allocataire_nom_usage'] = caf_nom_usage.where(caf_nom_usage != '', pivot_nom_usage)
    df['match-allocataire_prenom'] = caf_prenom.where(caf_prenom != '', pivot_prenom)

    return df, non_resolus


def resolve_beneficiaire_nom_usage(df: pd.DataFrame) -> pd.DataFrame:
    """Le nom d'usage du bénéficiaire, ce que les stratégies CAF du rapprochement comparent.

    Côté base, la CNAF range dans `nom` le NOMENF de son export, qui ne porte pas le suffixe
    NAI de ses noms de naissance : un nom d'usage, présumément. Le candidat en porte donc un
    aussi, pris :

    - sur une ligne 'enfant', dans `enfant_identite.preferred_username`, que le worker reprend
      de qf_enfants[].nom_usage et stocke sans jamais nommer l'enfant par lui ; à défaut —
      lignes écrites avant ce stockage — dans l'entrée de qf_enfants qui décrit l'enfant,
      retrouvée comme pour le genre (_entree_qf_de_l_enfant) ;
    - sur une ligne 'self', où le bénéficiaire EST l'allocataire : son nom d'usage à lui, déjà
      résolu. D'où l'ordre d'appel, APRÈS resolve_allocataire_caf.
    """
    df = df.copy()

    def nom_usage_for(row) -> str:
        if row['source'] != 'enfant':
            return _texte(row.get('match-allocataire_nom_usage'))

        stocke = _texte(row.get('enfant_nom_usage'))
        if stocke:
            return stocke

        enfant = _entree_qf_de_l_enfant(row)
        return unaccent_and_upper(_texte(enfant.get('nom_usage'))) if enfant else ''

    df['match-beneficiaire_nom_usage'] = '' if df.empty else df.apply(nom_usage_for, axis=1)
    return df


def _champ_du_json_allocataire(valeur, champ: str) -> str:
    """Relit un champ de la colonne JSON `allocataire`, déjà sérialisée à ce stade."""
    try:
        allocataire = json.loads(valeur) if valeur else {}
    except (TypeError, ValueError):
        return ''
    return str(allocataire.get(champ) or '') if isinstance(allocataire, dict) else ''


# Colonnes du CSV de rapprochement. Elles ne vont pas en production : elles vivent le temps
# d'une requête contre la base bénéficiaires. match_beneficiaires.sql les charge avec
# `header match`, qui exige ces noms dans cet ordre — une colonne ajoutée ici doit l'être
# aussi à sa table fc_candidats, sinon le chargement échoue au lieu de décaler les données.
MATCH_COLUMNS = [
    'eligibility_result_id',
    # Ce couple choisit la STRATÉGIE de rapprochement (une par situation et par caisse) : les
    # caisses n'écrivent pas la même nature de nom ni les mêmes champs allocataire en base.
    # Sur la route AAH, `organisme` est un défaut (aucun appel quotient_familial n'a nommé la
    # caisse) : match_beneficiaires.sql y essaie les DEUX stratégies.
    'situation',
    'organisme',
    'ine',
    'allocataire_nom',
    # Le nom d'usage n'est pas là par goût — partout ailleurs le code ne retient que le nom
    # de naissance de la réponse quotient_familial (candidates.ts, qf-batch.ts,
    # build_psp_columns). Il est là parce que les deux caisses ne rangent PAS la même chose
    # dans le `allocataire.nom` qui part en base : la MSA y met le nom de naissance, la CNAF
    # y met RESPDOS, qui est un nom d'usage. Les stratégies MSA comparent le premier, les
    # stratégies CAF le second.
    'allocataire_nom_usage',
    'allocataire_prenom',
    # Exigée par les stratégies qui la portent des deux côtés (AEEH/QF côté MSA, QF côté CAF
    # via beneficiaire_cnaf_extra_field) ; les autres ne la regardent pas — CNAF ne la
    # sérialise pas dans son JSON pour AAH/AEEH.
    'allocataire_date_naissance',
    # Le « genre » de l'allocataire tel que les partenaires l'écrivent en base : M / Mme.
    'allocataire_qualite',
    # Le même, au vocabulaire du pivot ('male'/'female') : ce que la stratégie QF-CAF
    # confronte à cnaf_allocataire_genre.
    'allocataire_genre',
    'beneficiaire_nom',
    # Seconde variante du nom du bénéficiaire, pour la même raison que celle de l'allocataire :
    # la CNAF range dans NOMENF un nom sans le suffixe NAI de ses noms de naissance.
    'beneficiaire_nom_usage',
    'beneficiaire_prenom',
    'beneficiaire_date_naissance',
    'beneficiaire_genre',
]


def build_match_candidates(df: pd.DataFrame) -> pd.DataFrame:
    """Réduit les bénéficiaires nettoyés aux colonnes que le rapprochement interroge.

    À appeler sur le DataFrame FINAL — après filtrage, normalisation de casse et
    déduplication — pour que les candidats soient exactement les lignes qui continuent.

    Aucune normalisation n'est faite ici : la clé est construite côté SQL, par
    `public.normalise_recherche`, pour que les deux côtés de la comparaison passent par la
    MÊME implémentation. Une normalisation Python en plus, et les deux dériveraient.

    Le repli du nom CAF sur l'état civil du pivot a déjà eu lieu, dans
    resolve_allocataire_caf ; l'INE, lui, a été rangé dans `allocataire-matricule` par
    build_psp_columns et se relit dans la colonne JSON.
    """
    def colonne(nom: str) -> pd.Series:
        return df[nom] if nom in df.columns else pd.Series('', index=df.index)

    candidats = pd.DataFrame({
        'eligibility_result_id': df['eligibility_result_id'],
        'situation': df['situation'],
        'organisme': df['organisme'],
        'ine': df['allocataire'].map(lambda v: _champ_du_json_allocataire(v, 'matricule')),
        'allocataire_nom': colonne('match-allocataire_nom_naissance'),
        'allocataire_nom_usage': colonne('match-allocataire_nom_usage'),
        'allocataire_prenom': colonne('match-allocataire_prenom'),
        'allocataire_date_naissance': df['allocataire'].map(
            lambda v: _champ_du_json_allocataire(v, 'date_naissance')),
        'allocataire_qualite': df['allocataire'].map(
            lambda v: _champ_du_json_allocataire(v, 'qualite')),
        'allocataire_genre': colonne('match-allocataire_genre'),
        'beneficiaire_nom': df['nom'],
        'beneficiaire_nom_usage': colonne('match-beneficiaire_nom_usage'),
        'beneficiaire_prenom': df['prenom'],
        # La date seule : la base stocke ces dates décalées de 4 h
        # (partners.shift_birthdate_by_hours) et le rapprochement n'en retient que le jour.
        'beneficiaire_date_naissance': pd.to_datetime(
            df['date_naissance'], errors='coerce').dt.strftime('%Y-%m-%d'),
        'beneficiaire_genre': df['genre'],
    })

    return candidats[MATCH_COLUMNS].fillna('')


def build_psp_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Projette l'export vers le schéma PSP attendu par generate_new_codes.ipynb.

    Le bénéficiaire est l'enfant sur les lignes `source == 'enfant'`, l'allocataire connecté
    lui-même sur les lignes `source == 'self'` — les deux identités vivent dans deux colonnes
    JSON distinctes, à plat ici.

    Crée aussi les colonnes `allocataire-*` et `adresse_allocataire-*` que les sérialiseurs
    JSON de partners_lib consomment. Toutes celles de l'adresse restent nulles : FranceConnect
    ne donne ni code organisme, ni téléphone, ni adresse postale, et le parcours ne demande plus
    la commune de résidence depuis que LCA en est débranché. Les valeurs nulles sont écartées du
    JSON produit, `adresse_allocataire` vaut donc `{}` pour cette source.
    """
    df = df.copy()

    is_enfant = df['source'] == 'enfant'

    df['nom'] = np.where(is_enfant, df['enfant_nom'], df['allocataire-nom_naissance'])
    df['prenom'] = np.where(is_enfant, df['enfant_prenom'], df['allocataire-prenom'])
    df['date_naissance'] = pd.to_datetime(
        np.where(is_enfant, df['enfant_date_naissance'], df['allocataire-date_naissance']),
        errors='coerce',
    )

    gender = df['allocataire-genre'].fillna('').astype(str).str.strip().str.lower()
    df['genre'] = np.where(is_enfant, df['enfant_genre'], gender.map(GENRE_BY_GENDER).fillna(''))

    # Le genre de l'allocataire au vocabulaire du pivot ('male'/'female'), pour le
    # rapprochement : la stratégie QF-CAF le confronte à cnaf_allocataire_genre, stocké sous
    # cette même forme. Colonne `match-*` et non charpente : elle doit survivre à
    # drop_intermediate_columns jusqu'à build_match_candidates.
    df['match-allocataire_genre'] = gender

    # Le JSON allocataire décrit le PARENT, y compris sur une ligne 'self' où il est aussi le
    # bénéficiaire : c'est ce que fait déjà chaque fichier partenaire.
    df['allocataire-qualite'] = gender.map(QUALITE_BY_GENDER)
    df['allocataire-nom'] = df['allocataire-nom_naissance']

    # None et non np.NaN pour ce que FranceConnect ne fournit pas : les deux sont écartés du
    # JSON par pd.notnull(), mais utils.format_insee_or_postal_code — que le sérialiseur
    # d'adresse applique au code postal ET au code INSEE — ne reconnaît comme vide que '' ou
    # None, et journalise bruyamment un échec de cast sur un NaN. Une ligne de bruit par
    # bénéficiaire noierait les compteurs du notebook.

    # L'INE sur les boursiers, rien ailleurs. C'est le seul identifiant que cette source
    # obtienne : la réponse quotient_familial ne porte AUCUN numéro d'allocataire, il n'existe
    # donc pas d'équivalent CAF ou MSA. CNOUS range l'INE dans ce même champ, d'où la
    # jointure exacte que match_beneficiaires.sql tente en premier.
    df['allocataire-matricule'] = df['crous_ine'].replace('', None) \
        if 'crous_ine' in df.columns else None
    df['allocataire-code_organisme'] = None
    df['allocataire-telephone'] = None

    df['adresse_allocataire-code_insee'] = None
    df['adresse_allocataire-voie'] = None
    df['adresse_allocataire-code_postal'] = None
    df['adresse_allocataire-commune'] = None
    df['adresse_allocataire-cplt_adresse'] = None

    # Chaînes vides -> NaN. Le notebook lit l'export avec keep_default_na=False, donc un champ
    # absent y arrive en '' et non en NaN ; `genre` vaut '' de son côté quand celui de l'enfant
    # n'a pas pu être retrouvé. Une colonne obligatoire manquante doit se présenter comme nulle
    # à filter_rows_missing_required_fields, pas comme vide, et le sérialiseur JSON écarte les
    # nulles là où il porterait une chaîne vide. .mask() plutôt que .replace(), qui redescend le
    # type d'une colonne devenue entièrement nulle et le signale par une FutureWarning à chaque
    # exécution du notebook.
    text_columns = df.select_dtypes(include='object').columns
    df[text_columns] = df[text_columns].mask(df[text_columns] == '')
    return df


def drop_intermediate_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Retire les colonnes de travail et la charpente déjà repliée dans les colonnes JSON.

    À n'appeler qu'APRÈS partners.add_allocataire_json_column et
    add_adresse_allocataire_json_column, qui consomment cette charpente.

    `eligibility_result_id` est conservée : c'est elle qui permettra à writeback_verdict.sql
    de marquer les lignes traitées. Les colonnes déjà supprimées en amont (par le
    `dropna(axis=1, how='all')` de partners.filter_rows_missing_required_fields) sont
    ignorées.
    """
    return df.drop(columns=[c for c in FINAL_COLUMNS_TO_DROP if c in df.columns])
