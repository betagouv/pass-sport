"""Vocabulary of the DN démarche, and the texts sent back.

Every label is compared folded (no accents, no case, single spaces, see `fold`), so a
renamed champ only needs its new label here. Situations and caisses are recognised by
keyword, the démarche spelling them out in full (« AAH (allocation aux adultes handicapés) »).

Checked against the real démarche with apercu_dn.sh and `pnpm dn:champs` (2026-10-27).
"""

import re
import unicodedata


def fold(value) -> str:
    # The typographic apostrophe first: the ASCII folding below would drop it.
    text = str(value or '').replace('’', "'")
    folded = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return ' '.join(folded.replace('_', ' ').lower().split())


# --- Démarches Numériques ---------------------------------------------------------

# Also read by the worker, which pre-fills dossiers from the espace FranceConnect: keep
# worker/src/demarche-numerique/champs-resolver.ts in step, then run `pnpm dn:champs` there.
DN_CHAMPS = {
    'allocataire_genre': 'Votre civilité :',
    'adresse': 'Adresse de résidence',
    'beneficiaire_de': 'Je suis bénéficiaire de :',
    'ine': 'Numéro INE (Identification Nationale Étudiant)',
    # The applicant's own caisse, for their AAH.
    'caisse': 'À quelle caisse êtes vous rattaché ?',
    'date_naissance': 'Votre date de naissance',
    'a_des_enfants': "Est ce qu'un ou plusieurs de vos enfants sont éligibles au Pass Sport ?",
    'caisse_enfants': 'A quelle caisse sont ils rattachés ?',
    'foyer_qf': "Font ils partie d'un foyer dont le quotient familial est inférieur ou égal à 699 € ?",
    'enfants_aeeh': (
        "Un ou plusieurs de vos enfants sont-ils bénéficiaires de l'AEEH (Allocation d'éducation "
        "de l'enfant handicapé) ?"),
    'enfants': 'Pour chaque enfant, merci de remplir les champs suivants :',
}

DN_ENFANT_CHAMPS = {
    'aeeh': "Est il bénéficiaire de l'AEEH (Allocation d'éducation de l'enfant handicapé)",
    'genre': "Genre de l'enfant",
    'prenom': "Prénom de l'enfant",
    'nom': "Nom de l'enfant",
    'date_naissance': "Date de naissance de l'enfant",
}


def situation_of_beneficiaire_de(label) -> str | None:
    """The direct aid a DN applicant claims for themself, None when it gives them no code."""
    situation = situation_of_label(label)
    return situation if situation in ('AAH', 'boursier') else None


# Labels the démarche administrators create by hand (the API cannot create them); a dossier
# holding any is skipped.
DN_LABELS = {
    'traite': 'Traité',
    'a_verifier': 'À vérifier',
    'rejete': 'Rejeté',
    # Added on top of the others to a dossier holding a beneficiary lamp01 already knows.
    'doublon': 'Doublon',
}

# Private annotation (instructeurs only) receiving the codes each run hands out, created by hand
# in the démarche as « Texte long ».
DN_ANNOTATION_CODES = 'Codes pass Sport'
DN_ANNOTATION_TYPE = 'TextareaChampDescriptor'

# --- Vocabularies -------------------------------------------------------------------

# Words (folded, matched whole) naming each PSP situation, as `Je suis bénéficiaire de :` spells them:
# « L'Allocation aux adultes handicapés (AAH) ».
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
    """AAH, AEEH, jeune or boursier from a label; None when none or several match."""
    return _named(fold(label), SITUATION_WORDS)


ORGANISME_BY_CAISSE_WORDS = {
    'CAF': ('caf', 'allocations familiales'),
    'MSA': ('msa', 'mutualite sociale agricole'),
}


def organisme_of_caisse(label) -> str | None:
    """CAF or MSA from a caisse answer, by keyword: 'CAF du Rhône' is CAF.

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
    'code_envoye': "{prenom} {nom} : code pass Sport {code}.",
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
