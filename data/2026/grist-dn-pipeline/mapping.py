"""Source vocabularies of the Grist table and the DN démarche, and the texts sent back.

Every label is compared folded (no accents, no case, single spaces, see `fold`), so a
renamed column only needs its new label here. Situations and caisses are recognised by
keyword, the sources spelling them out in full (« AAH (allocation aux adultes handicapés) »).

Checked against the real sources with apercu_grist.sh and apercu_dn.sh (2026-10-16).
"""

import re
import unicodedata


def fold(value) -> str:
    # The typographic apostrophe first: the ASCII folding below would drop it.
    text = str(value or '').replace('’', "'")
    folded = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return ' '.join(folded.replace('_', ' ').lower().split())


# --- Grist ------------------------------------------------------------------------

# Internal name -> column label in the Grist UI (resolved to column ids at runtime).
GRIST_COLUMNS = {
    'caisse': 'Caisse',
    'genre': 'Genre',
    'prenom': "Prénom de l'enfant",
    'nom': "Nom de l'enfant",
    'date_naissance': 'Date de naissance',
    'situation': 'Situation',
    'allocataire_genre': 'Genre allocataire',
    'allocataire_prenom': 'Prénom du parent allocataire',
    'allocataire_nom': 'Nom du parent allocataire',
    'matricule': 'n° allocataire ou INE',
    'email': 'Email',
    'code_insee': 'Code INSEE',
    'eligibilite': 'Eligibilité',
    'commentaire': 'Commentaire',
    'statut': 'Statut',
    'code': 'Code',
}

# Values of the `Eligibilité` choice column that let a row in (Oui / Non / empty met).
GRIST_ELIGIBLE_VALUES = {'oui'}

GRIST_STATUT = {
    'code_envoye': 'Code envoyé',
    'doublon': 'Doublon',
    'a_verifier': 'À vérifier',
    'rejete': 'Rejeté',
    # Coded, but production's injector filed the drop in failed/.
    'refuse_prod': 'Rejeté',
}

# --- Démarches Numériques ---------------------------------------------------------

# Also read by the worker, which pre-fills dossiers from the espace FranceConnect: keep
# worker/src/demarche-numerique/champs-resolver.ts in step, then run `pnpm dn:champs` there.
DN_CHAMPS = {
    'allocataire_genre': "Genre de l'allocataire",
    'adresse': 'Adresse de résidence',
    'beneficiaire_de': 'Bénéficiaire de',
    'ine': 'Numéro INE (Identification Nationale Étudiant)',
    'foyer_qf_aeeh': (
        "Faites-vous parti d'un foyer dont le quotient familial est inférieur ou égal à 699 € "
        "et/ou votre enfant est-il bénéficiaire de l'AEEH (Allocation d'éducation de l'enfant "
        "handicapé) ?"),
    'caisse': 'À quelle caisse appartenez-vous ?',
    'date_naissance': 'Votre date de naissance',
    'a_des_enfants': 'Avez-vous des enfants',
    'enfants': 'Enfants',
}

DN_ENFANT_CHAMPS = {
    'aeeh': "Bénéficiaire de l'AEEH (Allocation d'éducation de l'enfant handicapé)",
    'genre': "Genre de l'enfant",
    'prenom': "Prénom de l'enfant",
    'nom': "Nom de l'enfant",
    'date_naissance': "Date de naissance de l'enfant",
}


def situation_of_beneficiaire_de(label) -> str | None:
    """The direct aid a DN applicant claims for themself, None when it gives them no code."""
    situation = situation_of_label(label)
    return situation if situation in ('AAH', 'boursier') else None


# Only the dossiers whose usager logged in through FranceConnect are taken
# (Dossier.connectionUsager: france_connect, password or deleted).
DN_CONNECTION_USAGER = 'france_connect'

# Labels the démarche administrators create by hand (the API cannot create them); a dossier
# holding any is skipped.
DN_LABELS = {
    'traite': 'Traité',
    'a_verifier': 'À vérifier',
    'rejete': 'Rejeté',
}

# Private annotation (instructeurs only) receiving the codes each run hands out, created by hand
# in the démarche as « Texte long ».
DN_ANNOTATION_CODES = 'Codes pass Sport'
DN_ANNOTATION_TYPE = 'TextareaChampDescriptor'

# --- Shared vocabularies ------------------------------------------------------------

# Words (folded, matched whole) naming each PSP situation, as Grist's `Situation` and DN's
# `Bénéficiaire de` spell them: « Quotient familial inférieur ou égal à 699 € »,
# « AEEH (allocation d'éducation de l'enfant handicapé) », « AAH (allocation aux adultes
# handicapés) ».
SITUATION_WORDS = {
    'AAH': ('aah', 'adultes handicapes'),
    'AEEH': ('aeeh', "education de l'enfant handicape"),
    'jeune': ('quotient familial', 'qf', 'ars'),
    'boursier': ('bourse', 'boursier', 'boursiere', 'crous', 'cnous'),
}


def _named(folded: str, words_by_value: dict) -> str | None:
    found = {value for value, words in words_by_value.items()
             if any(re.search(rf'\b{re.escape(word)}\b', folded) for word in words)}
    return found.pop() if len(found) == 1 else None


def situation_of_label(label) -> str | None:
    """AAH, AEEH, jeune or boursier from a source's label; None when none or several match."""
    return _named(fold(label), SITUATION_WORDS)


ORGANISME_BY_CAISSE_WORDS = {
    'CAF': ('caf', 'allocations familiales'),
    'MSA': ('msa', 'mutualite sociale agricole'),
}


def organisme_of_caisse(label) -> str | None:
    """CAF or MSA from a free-text caisse (DN asks it as plain text): 'CAF du Rhône' is CAF.

    None when neither or both are named.
    """
    return _named(fold(label), ORGANISME_BY_CAISSE_WORDS)


GENRE_BY_LABEL = {
    'm': 'M', 'm.': 'M', 'monsieur': 'M', 'masculin': 'M', 'garcon': 'M', 'homme': 'M',
    'f': 'F', 'mme': 'F', 'mme.': 'F', 'madame': 'F', 'feminin': 'F', 'fille': 'F', 'femme': 'F',
}

# Partners write the allocataire's gender as a civilité.
QUALITE_BY_GENRE = {'M': 'M', 'F': 'Mme'}

YES = {'oui', 'true', 'yes'}
NO = {'non', 'false', 'no'}

# --- DN message to the applicant ------------------------------------------------------

DN_MESSAGE_LINE = {
    'code_envoye': "{prenom} {nom} : code pass Sport {code}, envoyé aussi par courriel à {email}.",
    'doublon': "{prenom} {nom} : un code pass Sport a déjà été attribué.",
    'a_verifier': "{prenom} {nom} : la demande est en cours de vérification par nos équipes.",
    'rejete': "{prenom} {nom} : demande non retenue ({motif}).",
}

DN_MESSAGE = (
    "Bonjour,\n\n"
    "Votre demande de pass Sport a été traitée :\n\n"
    "{lignes}\n\n"
    "L'équipe pass Sport"
)

DN_ACCEPT_MOTIVATION = "Demande traitée : codes pass Sport attribués."

# One line per code this run hands out, in the private annotation.
DN_ANNOTATION_LINE = "{prenom} {nom} : {code}"
