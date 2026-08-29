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

# Route CROUS : moins de 28 ans à la date de référence de la campagne (2026-12-31, cf.
# AGE_REFERENCE_DATE dans worker/src/lca/candidates.ts). « moins de 28 ans révolus » au
# 31/12/2026 = né à partir du 01/01/1999. Pas de borne haute : c'est le statut boursier,
# vérifié par API Particulier, qui ferme l'autre bout.
CROUS_DOB_MIN = datetime(1999, 1, 1)

# Route AEEH : 17-19 ans révolus.
#
# ATTENTION, cette fenêtre N'EST PAS partners.AEEH_DOB_MIN/MAX (6-19 ans) et ne doit pas le
# devenir. Les deux décrivent deux choses différentes :
#   - côté fichier partenaire, la CNAF DÉCLARE elle-même l'AEEH pour tout enfant concerné,
#     d'où une fenêtre large de 6 à 19 ans ;
#   - ici, c'est NOUS qui accordons l'aide, et seulement aux 17-19 ans : en dessous, le
#     quotient familial couvre déjà l'enfant et le worker n'appelle même pas l'AEEH.
# Ce sont les bornes AEEH_BIRTHDATE_MIN/MAX de worker/src/eligibility/types.ts, celles qui
# ont réellement produit les verdicts qu'on est en train de rejouer.
AEEH_DOB_MIN = datetime(2007, 1, 1)
AEEH_DOB_MAX = datetime(2009, 12, 31)

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
# FranceConnect et n'a ni matricule ni adresse postale.
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
    'residence_insee',
    'enfant_nom',
    'enfant_prenom',
    'enfant_date_naissance',
    'enfant_genre',
    'qf_valeur',
    'qf_fournisseur',
    'qf_enfants',
    'aah_est_beneficiaire',
    'crous_est_boursier',
    # charpente repliée dans la colonne JSON `allocataire`
    'allocataire-qualite',
    'allocataire-matricule',
    'allocataire-code_organisme',
    'allocataire-telephone',
    'allocataire-nom',
    'allocataire-prenom',
    'allocataire-courriel',
    'allocataire-nom_naissance',
    'allocataire-nom_usage',
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

    # Route AEEH : 17-19 ans, pour les enfants que le quotient ne couvre pas (voir
    # AEEH_DOB_MIN/MAX ci-dessus, qui ne sont pas celles de partners_lib). Les deux fenêtres
    # se chevauchent sur le millésime 2009 (17 ans) et QF y est prioritaire — d'où le
    # `& ~jeune`, qui reproduit le `else if` de candidates.ts.
    aeeh = is_enfant & ~jeune & _birthdate_within(dob, AEEH_DOB_MIN, AEEH_DOB_MAX)

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


def resolve_enfant_genre(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Retrouve le genre des enfants dans le tableau `enfants` de quotient_familial.

    `enfant_identite` ne stocke que family_name/given_name/birthdate (worker/src/index.ts) :
    le sexe n'y est pas, alors que `genre` est une colonne obligatoire. La réponse brute
    quotient_familial, elle, le porte — d'où l'appariement sur (nom, prénoms, date de
    naissance), le nom pouvant être le nom de naissance comme le nom d'usage puisque
    candidates.ts retient l'un ou l'autre.

    Renvoie (df, nombre d'enfants non appariés). Ceux-là gardent un genre vide et seront
    écartés plus loin ; un compte non nul mérite un coup d'œil, il signale un décalage
    entre l'identité persistée et la réponse d'origine.
    """
    df = df.copy()

    def genre_for(row) -> str:
        if row['source'] != 'enfant':
            return ''

        try:
            enfants = json.loads(row['qf_enfants']) if row['qf_enfants'] else []
        except (TypeError, ValueError):
            return ''

        cible = (
            unaccent_and_upper(str(row['enfant_nom'] or '')).strip(),
            unaccent_and_upper(str(row['enfant_prenom'] or '')).strip(),
            _to_iso_birthdate(row['enfant_date_naissance']),
        )

        for enfant in enfants:
            prenoms = unaccent_and_upper(str(enfant.get('prenoms') or '')).strip()
            naissance = _to_iso_birthdate(enfant.get('date_naissance'))
            for cle_nom in ('nom_naissance', 'nom_usage'):
                nom = unaccent_and_upper(str(enfant.get(cle_nom) or '')).strip()
                if nom and (nom, prenoms, naissance) == cible:
                    return GENRE_BY_SEXE.get(str(enfant.get('sexe') or '').strip().upper(), '')

        return ''

    df['enfant_genre'] = '' if df.empty else df.apply(genre_for, axis=1)

    non_resolus = int(((df['source'] == 'enfant') & (df['enfant_genre'] == '')).sum())
    return df, non_resolus


def build_psp_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Projette l'export vers le schéma PSP attendu par generate_new_codes.ipynb.

    Le bénéficiaire est l'enfant sur les lignes `source == 'enfant'`, l'allocataire connecté
    lui-même sur les lignes `source == 'self'` — les deux identités vivent dans deux colonnes
    JSON distinctes, à plat ici.

    Crée aussi les colonnes `allocataire-*` et `adresse_allocataire-*` que les sérialiseurs
    JSON de partners_lib consomment. La plupart restent NaN : FranceConnect ne donne ni code
    organisme, ni téléphone, et pas d'adresse postale — seul le code INSEE de la commune de
    résidence est connu. Les valeurs nulles sont écartées du JSON produit, ces colonnes
    n'apparaîtront donc pas dans le résultat.
    """
    df = df.copy()

    # Chaînes vides -> NaN, AVANT toute dérivation. Le notebook lit l'export avec
    # keep_default_na=False, donc un champ absent arrive en '' et non en NaN : sans cette
    # normalisation en tête, le repli d'une colonne sur l'autre ci-dessous (nom d'usage ->
    # nom de naissance) verrait une valeur là où il n'y en a pas. .mask() plutôt que
    # .replace(), qui redescend le type d'une colonne devenue entièrement nulle et le signale
    # par une FutureWarning à chaque exécution du notebook.
    text_columns = df.select_dtypes(include='object').columns
    df[text_columns] = df[text_columns].mask(df[text_columns] == '')

    is_enfant = df['source'] == 'enfant'

    df['nom'] = np.where(is_enfant, df['enfant_nom'], df['allocataire-nom_naissance'])
    df['prenom'] = np.where(is_enfant, df['enfant_prenom'], df['allocataire-prenom'])
    df['date_naissance'] = pd.to_datetime(
        np.where(is_enfant, df['enfant_date_naissance'], df['allocataire-date_naissance']),
        errors='coerce',
    )

    gender = df['allocataire-genre'].fillna('').astype(str).str.strip().str.lower()
    df['genre'] = np.where(is_enfant, df['enfant_genre'], gender.map(GENRE_BY_GENDER).fillna(''))

    # Le JSON allocataire décrit le PARENT, y compris sur une ligne 'self' où il est aussi le
    # bénéficiaire : c'est ce que fait déjà chaque fichier partenaire.
    df['allocataire-qualite'] = gender.map(QUALITE_BY_GENDER)
    df['allocataire-nom'] = df['allocataire-nom_usage'].fillna(df['allocataire-nom_naissance'])

    # None et non np.NaN pour ce que FranceConnect ne fournit pas : les deux sont écartés du
    # JSON par pd.notnull(), mais utils.format_insee_or_postal_code — que le sérialiseur
    # d'adresse applique au code postal — ne reconnaît comme vide que '' ou None, et
    # journalise bruyamment un échec de cast sur un NaN. Une ligne de bruit par bénéficiaire
    # noierait les compteurs du notebook.
    
    df['allocataire-matricule'] = '1234567'
    df['allocataire-code_organisme'] = None
    df['allocataire-telephone'] = None

    df['adresse_allocataire-code_insee'] = df['residence_insee']
    df['adresse_allocataire-voie'] = None
    df['adresse_allocataire-code_postal'] = None
    df['adresse_allocataire-commune'] = None
    df['adresse_allocataire-cplt_adresse'] = None

    # Second passage, sur les colonnes DÉRIVÉES cette fois : `genre` vaut '' quand le genre
    # de l'enfant n'a pas pu être retrouvé, et une colonne obligatoire manquante doit se
    # présenter comme nulle à filter_rows_missing_required_fields, pas comme vide.
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
