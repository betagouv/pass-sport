"""Python steps of run_dn.sh: beneficiaries of the Démarches Numériques dossiers.

    python dn_pipeline.py fetch     # DN API -> raw JSON of the dossiers left to process
    python dn_pipeline.py clean     # raw JSON -> PSP schema, match candidates, rejects
    python dn_pipeline.py split     # match_dn.sql output -> doublons / à vérifier / à coder
    python dn_pipeline.py retours   # verdicts -> codes annotation, message, label, acceptance

Code drawing and the prod/lamp01 split are the FranceConnect ones (fc_pipeline.py codes and
writeback), called directly by the shell script. Matching is NOT the FranceConnect one: see
match_dn.sql.

API settings come from the environment (data/.env, loaded by the shell script).

See test_dn_pipeline.py for the unit tests.
"""

import argparse
import csv
import json
import os
import re
import sys
import uuid
from collections import Counter
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import requests

PIPELINE_DIR = Path(__file__).resolve().parent
DATA_DIR = PIPELINE_DIR.parent.parent
PARTNERS_DIR = DATA_DIR / '2026' / 'partners'
FC_DIR = PARTNERS_DIR / 'franceconnect'

for _root in (DATA_DIR, PARTNERS_DIR, FC_DIR, PIPELINE_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_fc_lib as fc  # noqa: E402
import mapping  # noqa: E402
import partners_lib as partners  # noqa: E402
from dn_client import DEFAULT_API_URL, DnApiError, DnClient, DnMutationError  # noqa: E402

# The beneficiary themself holds the aid; on the other routes the allocataire is a parent.
SELF_SITUATIONS = {'AAH', 'boursier'}
CHILD_SITUATIONS = {'AEEH', 'jeune'}

DOB_WINDOWS = {
    'AAH': (partners.AAH_DOB_MIN.date(), partners.AAH_DOB_MAX.date()),
    'AEEH': (partners.AEEH_DOB_MIN.date(), partners.AEEH_DOB_MAX.date()),
    'jeune': (partners.QF_DOB_MIN.date(), partners.QF_DOB_MAX.date()),
    'boursier': (fc.CROUS_DOB_MIN.date(), None),
}

DN_DOSSIER_URL = 'https://demarche.numerique.gouv.fr/procedures/{demarche}/dossiers/{dossier}'

# The traitements that put a dossier en instruction, the automatic one carrying no agent.
INSTRUCTION_EVENTS = {
    'passe_en_instruction', 'repasse_en_instruction', 'passe_en_instruction_automatiquement',
}

# What every output carries to trace a line back to its DN dossier.
SUIVI_COLUMNS = [
    'reference', 'dossier_id', 'dossier_number', 'lien', 'prenom', 'nom', 'date_naissance', 'email',
]
EXTRACTED_COLUMNS = [
    *SUIVI_COLUMNS, 'genre', 'situation_label', 'situation', 'caisse', 'ine',
    'allocataire_genre', 'allocataire_prenom', 'allocataire_nom', 'allocataire_date_naissance',
    'allocataire_matricule', 'code_insee', 'code_postal', 'commune', 'voie', 'motif',
]
# Exactly the production schema, plus the run-local key split_writeback drops.
CLEANED_COLUMNS = [
    'eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'genre', 'situation',
    'organisme', 'allocataire', 'adresse_allocataire',
]
# match_dn.sql loads them with `header match`: same names, same order.
MATCH_COLUMNS = [
    'eligibility_result_id', 'situation', 'ine', 'nom', 'prenom', 'date_naissance', 'genre',
    'allocataire_genre', 'allocataire_nom', 'allocataire_prenom', 'allocataire_date_naissance',
]
IDENTITY_COLUMNS = [
    'eligibility_result_id', *SUIVI_COLUMNS, 'genre', 'situation', 'caisse',
    'allocataire_prenom', 'allocataire_nom', 'allocataire_genre', 'allocataire_date_naissance',
]
REJECT_COLUMNS = [*SUIVI_COLUMNS, 'motif']
VERDICT_COLUMNS = ['eligibility_result_id', *SUIVI_COLUMNS, 'verdict', 'motif']
# The lamp01 side of a correspondence, as match_dn.sql exports it.
TOUCHED_COLUMNS = [
    'id_psp', 'nom', 'prenom', 'date_naissance', 'genre', 'situation', 'organisme',
    'allocataire_qualite', 'allocataire_nom', 'allocataire_prenom', 'allocataire_date_naissance',
    'allocataire_courriel', 'adresse_allocataire_code_insee', 'created_at',
]
INVESTIGATION_COLUMNS = [
    'verdict', 'type', 'reference', 'lien', 'saisie_nom', 'saisie_prenom',
    'saisie_date_naissance', 'saisie_genre', 'saisie_situation', 'saisie_caisse',
    'saisie_allocataire_nom', 'saisie_allocataire_prenom', 'saisie_allocataire_genre',
    'saisie_allocataire_date_naissance', 'saisie_email',
    *(f'lamp01_{column}' for column in TOUCHED_COLUMNS),
]
JOURNAL_COLUMNS = ['reference', 'action', 'statut', 'detail', 'horodatage']

READABLE_FIELD = {
    'nom': 'nom', 'prenom': 'prénom', 'date_naissance': 'date de naissance', 'genre': 'genre',
    'email': 'email', 'situation_label': 'situation', 'caisse': 'caisse',
    'allocataire_nom': 'nom du parent', 'allocataire_prenom': 'prénom du parent',
    'allocataire_genre': 'genre du parent',
}

EMAIL_PATTERN = re.compile(r'^[^@\s;]+@[^@\s;]+\.[^@\s;]+$')
INSEE_PATTERN = re.compile(r'^(\d{5}|2[AB]\d{3})$')
DATE_FORMATS = ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y')

GENDER_BY_GENRE = {'M': 'male', 'F': 'female'}

# The FranceConnect MSA strategies of match_beneficiaires.sql find a code again by the
# allocataire's birthdate: fc_pipeline serialises it under the same key.
ALLOCATAIRE_EXTRA_FIELDS = {'date_naissance': 'allocataire-date_naissance'}


# --- shared helpers -------------------------------------------------------------------

def _text(value) -> str:
    if value is None:
        return ''
    return str(value).strip()


def parse_date(value) -> date | None:
    text = _text(value)
    if re.match(r'^\d{4}-\d{2}-\d{2}T', text):
        text = text[:10]
    for date_format in DATE_FORMATS:
        try:
            return datetime.strptime(text, date_format).date()
        except ValueError:
            continue
    return None


def normalize_insee(value) -> str | None:
    text = _text(value).upper()
    if text.isdigit() and len(text) < 5:
        text = text.zfill(5)
    return text if INSEE_PATTERN.match(text) else None


def _genre(value) -> str:
    return mapping.GENRE_BY_LABEL.get(mapping.fold(value), '')


def _required_env(name: str) -> str:
    value = os.environ.get(name, '')
    if not value:
        raise SystemExit(f"variable d'environnement manquante : {name}")
    return value


def _read(filepath, **kwargs) -> pd.DataFrame:
    return pd.read_csv(filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False,
                       **kwargs)


def _write(df: pd.DataFrame, filepath, columns, **kwargs) -> None:
    df.reindex(columns=columns).fillna('').to_csv(
        filepath, sep=';', index=False, encoding='utf-8', **kwargs)


def _write_json(payload, filepath) -> None:
    Path(filepath).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8')


# --- fetch ------------------------------------------------------------------------------

def dn_instructeur_id(dossier: dict) -> str:
    """The instructeur who last put the dossier en instruction, in whose name it is answered; ''
    when DN did it automatically or they no longer belong to the dossier's groupe."""
    moves = [traitement for traitement in dossier.get('traitements') or []
             if traitement['event'] in INSTRUCTION_EVENTS]
    if not moves:
        return ''
    last = max(moves, key=lambda traitement: datetime.fromisoformat(traitement['dateTraitement']))
    email = (last.get('emailAgentTraitant') or '').lower()
    instructeurs = (dossier.get('groupeInstructeur') or {}).get('instructeurs') or []
    return next((instructeur['id'] for instructeur in instructeurs
                 if email and instructeur['email'].lower() == email), '')


def dn_skip_reason(dossier: dict) -> str:
    """Why the pipeline leaves a dossier alone, '' when it takes it: en instruction, filed
    through FranceConnect, holding none of its labels, and put en instruction by an instructeur
    of its groupe."""
    if dossier['state'] != 'en_instruction':
        return 'pas en instruction'
    if dossier.get('connectionUsager') != mapping.DN_CONNECTION_USAGER:
        return 'sans FranceConnect'
    ours = {mapping.fold(name) for name in mapping.DN_LABELS.values()}
    if any(mapping.fold(label['name']) in ours for label in dossier['labels']):
        return 'déjà labellisé'
    if not dn_instructeur_id(dossier):
        return 'sans instructeur'
    return ''


def fetch_dn(client: DnClient, numero: int) -> dict:
    """The dossiers en instruction, filed through FranceConnect, without the pipeline's labels,
    put en instruction by an instructeur of their groupe."""
    label_id_by_name = {mapping.fold(name): label_id for name, label_id in client.labels(numero).items()}
    missing = [name for name in mapping.DN_LABELS.values() if mapping.fold(name) not in label_id_by_name]
    if missing:
        raise ValueError(f"labels absents de la démarche {numero} : {', '.join(missing)}")
    annotation = {mapping.fold(label): spec for label, spec in client.annotations(numero).items()}.get(
        mapping.fold(mapping.DN_ANNOTATION_CODES))
    if annotation is None or annotation['type'] != mapping.DN_ANNOTATION_TYPE:
        raise ValueError(f"annotation privée « {mapping.DN_ANNOTATION_CODES} » de type Texte long "
                         f"absente de la démarche {numero}")

    dossiers, skipped = [], Counter()
    for dossier in client.iter_dossiers(numero):
        reason = dn_skip_reason(dossier)
        if reason:
            skipped[reason] += 1
        else:
            dossiers.append(dossier)

    return {
        'demarche': numero,
        'labels': {key: label_id_by_name[mapping.fold(name)] for key, name in mapping.DN_LABELS.items()},
        'dossiers': dossiers,
        'ignores': sum(skipped.values()),
        'ignores_par_motif': dict(skipped),
    }


def fetch(dn_out) -> dict:
    client = DnClient(os.environ.get('DN_API_URL') or DEFAULT_API_URL, _required_env('DN_API_TOKEN'))
    dn = fetch_dn(client, int(_required_env('DN_DEMARCHE_NUMBER')))
    _write_json(dn, dn_out)
    return {
        'dn_dossiers': len(dn['dossiers']),
        'dn_ignores': dn['ignores'],
        'dn_ignores_par_motif': dn['ignores_par_motif'],
    }


# --- extraction: one line per beneficiary -----------------------------------------------

def _champs_by_label(champs: list[dict]) -> dict:
    return {mapping.fold(champ['label']): champ for champ in champs or []}


def _champ_text(champ: dict | None) -> str:
    return _text((champ or {}).get('stringValue'))


def _champ_date(champ: dict | None) -> str:
    return _text((champ or {}).get('date')) or _champ_text(champ)


def _champ_yes(champ: dict | None) -> bool:
    return (champ or {}).get('oui') is True or mapping.fold(_champ_text(champ)) in mapping.YES


def _champ_no(champ: dict | None) -> bool:
    return (champ or {}).get('oui') is False or mapping.fold(_champ_text(champ)) in mapping.NO


def _champ(champs: dict, label: str) -> dict | None:
    return champs.get(mapping.fold(label))


def _enfant_rows(dossier: dict, champs: dict) -> list[dict]:
    enfants = _champ(champs, mapping.DN_CHAMPS['enfants'])
    if enfants is None:
        repetitions = [c for c in dossier['champs'] if c.get('__typename') == 'RepetitionChamp']
        enfants = repetitions[0] if len(repetitions) == 1 else {}
    return enfants.get('rows') or []


def _enfant_row(row: dict, common: dict, number: str, index: int, foyer: dict) -> dict:
    enfant = _champs_by_label(row.get('champs'))
    labels = mapping.DN_ENFANT_CHAMPS
    aeeh = foyer['aeeh'] and _champ_yes(_champ(enfant, labels['aeeh']))
    situation = 'AEEH' if aeeh else ('jeune' if foyer['qf'] else '')
    return {
        **common,
        'reference': f'dn:{number}:enfant-{index}',
        'caisse': foyer['caisse'],
        'prenom': _champ_text(_champ(enfant, labels['prenom'])),
        'nom': _champ_text(_champ(enfant, labels['nom'])),
        'date_naissance': _champ_date(_champ(enfant, labels['date_naissance'])),
        'genre': _champ_text(_champ(enfant, labels['genre'])),
        'situation_label': 'AEEH' if aeeh else 'QF',
        'situation': situation,
        'motif': '' if situation else
        "enfant ni bénéficiaire de l'AEEH ni dans un foyer au quotient familial ≤ 699 €",
    }


def _dossier_rows(dossier: dict, demarche) -> list[dict]:
    champs = _champs_by_label(dossier['champs'])
    labels = mapping.DN_CHAMPS

    demandeur = dossier.get('demandeur') or {}
    email = demandeur.get('email') if dossier.get('deposeParUnTiers') else (
        (dossier.get('usager') or {}).get('email'))
    address = (_champ(champs, labels['adresse']) or {}).get('address') or {}
    number = str(dossier['number'])
    common = {
        'dossier_id': dossier['id'],
        'dossier_number': number,
        'lien': DN_DOSSIER_URL.format(demarche=demarche, dossier=number),
        'email': _text(email),
        'code_insee': _text(address.get('cityCode')),
        'code_postal': _text(address.get('postalCode')),
        'commune': _text(address.get('cityName')),
        'voie': _text(address.get('streetAddress')),
        'allocataire_genre': (_champ_text(_champ(champs, labels['allocataire_genre']))
                              or _text(demandeur.get('civilite'))),
        'allocataire_prenom': _text(demandeur.get('prenom')),
        'allocataire_nom': _text(demandeur.get('nom')),
        # Asked of every applicant, who is also the children's allocataire.
        'allocataire_date_naissance': _champ_date(_champ(champs, labels['date_naissance'])),
    }
    applicant = {
        'prenom': common['allocataire_prenom'],
        'nom': common['allocataire_nom'],
        'genre': common['allocataire_genre'],
    }
    found = []

    beneficiaire_de = _champ_text(_champ(champs, labels['beneficiaire_de']))
    self_situation = mapping.situation_of_beneficiaire_de(beneficiaire_de)
    if self_situation:
        ine = _champ_text(_champ(champs, labels['ine'])) if self_situation == 'boursier' else ''
        found.append({
            **common, **applicant,
            'reference': f'dn:{number}:demandeur',
            'date_naissance': common['allocataire_date_naissance'],
            'situation_label': beneficiaire_de,
            'situation': self_situation,
            'caisse': _champ_text(_champ(champs, labels['caisse'])),
            'ine': ine,
            'allocataire_matricule': ine,
        })

    # A block answered "no children" may still carry rows typed before that answer, and a
    # child's AEEH answer may predate the foyer's "no".
    if not _champ_no(_champ(champs, labels['a_des_enfants'])):
        foyer = {
            'caisse': _champ_text(_champ(champs, labels['caisse_enfants'])),
            'qf': _champ_yes(_champ(champs, labels['foyer_qf'])),
            'aeeh': not _champ_no(_champ(champs, labels['enfants_aeeh'])),
        }
        found += [_enfant_row(row, common, number, index, foyer)
                  for index, row in enumerate(_enfant_rows(dossier, champs), start=1)]

    if not found:
        found.append({
            **common, **applicant,
            'reference': f'dn:{number}:dossier',
            'situation_label': beneficiaire_de,
            'motif': "aucun bénéficiaire dans le dossier (ni AAH, ni bourse, ni enfant éligible)",
        })
    return found


def dn_rows(raw: dict) -> list[dict]:
    """Each dossier's beneficiaries: the applicant on a direct aid, then each child.

    The mandataire (dépôt pour un tiers) is never used: the applicant's own identity and
    email are.
    """
    return [row for dossier in raw.get('dossiers', [])
            for row in _dossier_rows(dossier, raw.get('demarche', ''))]


def extract(dn_raw: dict) -> pd.DataFrame:
    return pd.DataFrame(dn_rows(dn_raw), columns=EXTRACTED_COLUMNS).fillna('')


# --- clean ------------------------------------------------------------------------------

def _rejection_reason(row) -> str:
    if row['motif']:
        return row['motif']

    situation = row['situation']
    required = ['nom', 'prenom', 'date_naissance', 'genre', 'email', 'situation_label']
    if situation != 'boursier':
        required.append('caisse')
    if situation in CHILD_SITUATIONS:
        # The parent's gender only gives their civilité in lamp01: optional.
        required += ['allocataire_nom', 'allocataire_prenom']
    empty = [READABLE_FIELD[column] for column in required if not row[column]]
    if empty:
        return f"champ vide : {', '.join(empty)}"

    if not situation:
        return f"situation inconnue : {row['situation_label']}"
    if situation != 'boursier' and mapping.organisme_of_caisse(row['caisse']) is None:
        return f"caisse inconnue : {row['caisse']}"
    if not _genre(row['genre']):
        return f"genre inconnu : {row['genre']}"
    if situation in CHILD_SITUATIONS and row['allocataire_genre'] and not _genre(row['allocataire_genre']):
        return f"genre du parent inconnu : {row['allocataire_genre']}"

    birthdate = parse_date(row['date_naissance'])
    if birthdate is None:
        return f"date de naissance illisible (JJ/MM/AAAA attendu) : {row['date_naissance']}"
    if not EMAIL_PATTERN.match(row['email']):
        return f"email invalide : {row['email']}"
    if row['code_insee'] and normalize_insee(row['code_insee']) is None:
        return f"code INSEE invalide : {row['code_insee']}"

    dob_min, dob_max = DOB_WINDOWS[situation]
    if birthdate < dob_min or (dob_max is not None and birthdate > dob_max):
        bounds = f"{dob_min:%d/%m/%Y} - {dob_max:%d/%m/%Y}" if dob_max else f"à partir du {dob_min:%d/%m/%Y}"
        return f"hors fenêtre {situation} ({bounds}) : {birthdate:%d/%m/%Y}"
    return ''


def validate(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Splits the extracted lines into (valid, rejected), each rejected line with its `motif`."""
    df = df.copy()
    df['motif'] = df.apply(_rejection_reason, axis=1) if len(df) else pd.Series(dtype=str)

    valid = df[df['motif'] == ''].copy()
    valid['date_naissance'] = valid['date_naissance'].map(parse_date).map(lambda d: d.isoformat())
    # Only serves a later FranceConnect run to find the code again: missing or unreadable, it
    # is left out rather than rejecting the line.
    valid['allocataire_date_naissance'] = valid['allocataire_date_naissance'].map(parse_date).map(
        lambda d: d.isoformat() if d else '')
    valid['genre'] = valid['genre'].map(_genre)
    valid['allocataire_genre'] = valid['allocataire_genre'].map(_genre)
    valid['email'] = valid['email'].str.lower()
    valid['code_insee'] = valid['code_insee'].map(lambda v: normalize_insee(v) if v else '')
    valid['organisme'] = [
        fc.ORGANISME_BOURSIER if situation == 'boursier'
        else mapping.organisme_of_caisse(caisse)
        for situation, caisse in zip(valid['situation'], valid['caisse'], strict=True)
    ]
    return valid, df[df['motif'] != '']


def drop_duplicates(valid: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The same person twice in the batch (in one dossier or across several): the first wins."""
    key = (partners.normalise_recherche(valid['nom']) + '|'
           + partners.normalise_recherche(valid['prenom']) + '|' + valid['date_naissance'])
    duplicated = key.duplicated(keep='first')
    first_reference = valid['reference'].groupby(key).transform('first')
    duplicates = valid[duplicated].assign(motif='doublon de ' + first_reference[duplicated])
    return valid[~duplicated], duplicates


def _or_none(series: pd.Series) -> pd.Series:
    return series.where(series != '', None)


def to_psp(valid: pd.DataFrame) -> pd.DataFrame:
    """Valid lines -> PSP columns, still carrying the raw identity for the later steps."""
    on_self = valid['situation'].isin(SELF_SITUATIONS)
    allocataire_genre = valid['genre'].where(on_self, valid['allocataire_genre'])

    df = pd.DataFrame({
        'eligibility_result_id': [str(uuid.uuid4()) for _ in range(len(valid))],
        'nom': valid['nom'],
        'prenom': valid['prenom'],
        'date_naissance': pd.to_datetime(valid['date_naissance']),
        'genre': valid['genre'],
        'situation': valid['situation'],
        'organisme': valid['organisme'],
        'allocataire-qualite': allocataire_genre.map(mapping.QUALITE_BY_GENRE),
        'allocataire-matricule': _or_none(valid['allocataire_matricule']),
        'allocataire-code_organisme': None,
        'allocataire-telephone': None,
        'allocataire-nom': valid['nom'].where(on_self, valid['allocataire_nom']),
        'allocataire-prenom': valid['prenom'].where(on_self, valid['allocataire_prenom']),
        'allocataire-date_naissance': _or_none(
            valid['date_naissance'].where(on_self, valid['allocataire_date_naissance'])),
        'allocataire-courriel': valid['email'],
        'adresse_allocataire-voie': _or_none(valid['voie']),
        'adresse_allocataire-code_postal': _or_none(valid['code_postal']),
        'adresse_allocataire-commune': _or_none(valid['commune']),
        'adresse_allocataire-code_insee': _or_none(valid['code_insee']),
        'adresse_allocataire-cplt_adresse': None,
    }, index=valid.index)

    # The final shaping of every other source (fc_pipeline.clean, aah_direct_pipeline.to_psp), so
    # lamp01 holds the same names whatever the journey: unaccent_and_upper, nothing more.
    df = partners.normalize_identity_casing(df)
    df = partners.normalize_email_casing(df)
    df = partners.add_allocataire_json_column(df, extra_fields=ALLOCATAIRE_EXTRA_FIELDS)
    df = partners.add_adresse_allocataire_json_column(df)
    return partners.shift_birthdate_by_hours(df)


def build_match_candidates(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """The names as typed: match_dn.sql normalises both sides with the same function."""
    return pd.DataFrame({
        'eligibility_result_id': psp['eligibility_result_id'],
        'situation': valid['situation'],
        'ine': valid['ine'],
        'nom': valid['nom'],
        'prenom': valid['prenom'],
        'date_naissance': valid['date_naissance'],
        'genre': valid['genre'],
        'allocataire_genre': valid['allocataire_genre'],
        'allocataire_nom': valid['allocataire_nom'],
        'allocataire_prenom': valid['allocataire_prenom'],
        'allocataire_date_naissance': valid['allocataire_date_naissance'],
    })[MATCH_COLUMNS]


def build_cnaf_extra_field_rows(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """The allocataire of every CAF line, as lamp01 holds it: the FranceConnect CAF strategies
    find such a code again only through this side table, and without it the site would mint a
    second one. The AAH beneficiary is their own allocataire, a child's is their parent. Empty
    off CAF, no strategy reads it there."""
    allocataire = psp['allocataire'].map(json.loads)
    on_self = valid['situation'].isin(SELF_SITUATIONS)
    rows = pd.DataFrame({
        'eligibility_result_id': psp['eligibility_result_id'],
        'cnaf_allocataire_nom_naissance': allocataire.map(lambda a: a.get('nom', '')),
        'cnaf_allocataire_date_naissance': allocataire.map(lambda a: a.get('date_naissance', '')),
        'cnaf_allocataire_genre': valid['genre'].where(on_self, valid['allocataire_genre']).map(
            GENDER_BY_GENRE),
    })
    rows.loc[valid['organisme'] != 'CAF', fc.CNAF_EXTRA_FIELD_COLUMNS] = ''
    return rows.fillna('')[['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS]]


def build_identities(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """What the DN messages and the investigation show: names as typed."""
    on_self = valid['situation'].isin(SELF_SITUATIONS)
    return valid.assign(
        eligibility_result_id=psp['eligibility_result_id'],
        allocataire_prenom=valid['prenom'].where(on_self, valid['allocataire_prenom']),
        allocataire_nom=valid['nom'].where(on_self, valid['allocataire_nom']),
        allocataire_genre=valid['genre'].where(on_self, valid['allocataire_genre']),
        allocataire_date_naissance=valid['date_naissance'].where(on_self, valid['allocataire_date_naissance']),
    ).reindex(columns=IDENTITY_COLUMNS)


def clean(dn_filepath, output_filepath, match_filepath, cnaf_extra_filepath, identities_filepath,
          rejects_filepath) -> dict:
    extracted = extract(json.loads(Path(dn_filepath).read_text(encoding='utf-8')))
    valid, rejected = validate(extracted)
    valid, duplicates = drop_duplicates(valid)
    rejected = pd.concat([rejected, duplicates])

    _write(rejected, rejects_filepath, REJECT_COLUMNS)

    psp = to_psp(valid) if len(valid) else pd.DataFrame(columns=CLEANED_COLUMNS)
    _write(psp, output_filepath, CLEANED_COLUMNS, quoting=csv.QUOTE_ALL)
    if len(valid):
        _write(build_match_candidates(psp, valid), match_filepath, MATCH_COLUMNS)
        _write(build_cnaf_extra_field_rows(psp, valid), cnaf_extra_filepath,
               ['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS])
        _write(build_identities(psp, valid), identities_filepath, IDENTITY_COLUMNS)
    else:
        _write(pd.DataFrame(), match_filepath, MATCH_COLUMNS)
        _write(pd.DataFrame(), cnaf_extra_filepath, ['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS])
        _write(pd.DataFrame(), identities_filepath, IDENTITY_COLUMNS)

    return {
        'lignes_lues': len(extracted),
        'lignes_rejetees': len(rejected) - len(duplicates),
        'doublons_du_lot': len(duplicates),
        'beneficiaires': len(valid),
        **{f'situation_{s}': int((valid['situation'] == s).sum()) for s in DOB_WINDOWS},
        'rejets': str(rejects_filepath),
    }


# --- split ------------------------------------------------------------------------------

VERDICT_MOTIF = {
    'exacte': "déjà connu de lamp01 (nom, prénom et date de naissance identiques)",
    'ine': "déjà connu de lamp01 (même INE)",
    'proche': "ressemble à une personne connue de lamp01 : voir investigation.csv",
    'parent': "même date de naissance et même parent qu'une personne connue de lamp01 : voir investigation.csv",
    'identite': ("boursier sans INE : mêmes nom, prénom et date de naissance qu'une personne connue de "
                 "lamp01, mais genre ou situation différents : voir investigation.csv"),
}
# The à vérifier motif a line gets, from the most to the least specific of its correspondences.
REVIEW_TYPES = ('identite', 'proche', 'parent')


def split(cleaned_filepath, correspondences_filepath, touched_filepath, identities_filepath,
          rejects_filepath, to_code_filepath, verdicts_filepath, investigation_filepath) -> dict:
    """Exact (or INE) correspondence = doublon; close, same-parent or loose boursier one only =
    à vérifier; none = à coder."""
    cleaned = _read(cleaned_filepath, quoting=csv.QUOTE_ALL)
    correspondences = _read(correspondences_filepath)
    touched = _read(touched_filepath)
    identities = _read(identities_filepath)
    rejects = _read(rejects_filepath)

    assert {'eligibility_result_id', 'id_psp', 'type'} <= set(correspondences.columns), \
        "le fichier des correspondances ne vient pas de match_dn.sql"

    types = correspondences.groupby('eligibility_result_id')['type'].agg(set)
    doublon_type = {rid: ('ine' if 'ine' in t else 'exacte') for rid, t in types.items()
                    if t & {'exacte', 'ine'}}
    review_type = {rid: next(kind for kind in REVIEW_TYPES if kind in t) for rid, t in types.items()
                   if rid not in doublon_type}

    verdict = pd.Series('a_coder', index=identities.index)
    motif = pd.Series('', index=identities.index)
    ids = identities['eligibility_result_id']
    is_doublon = ids.isin(doublon_type)
    verdict[is_doublon] = 'doublon'
    motif[is_doublon] = ids[is_doublon].map(doublon_type).map(VERDICT_MOTIF)
    is_review = ids.isin(review_type)
    verdict[is_review] = 'a_verifier'
    motif[is_review] = ids[is_review].map(review_type).map(VERDICT_MOTIF)

    verdicts = pd.concat([
        identities.assign(verdict=verdict, motif=motif),
        rejects.assign(eligibility_result_id='', verdict='rejete'),
    ])
    _write(verdicts.sort_values('reference'), verdicts_filepath, VERDICT_COLUMNS)

    _write(cleaned[~cleaned['eligibility_result_id'].isin(types.index)], to_code_filepath,
           CLEANED_COLUMNS, quoting=csv.QUOTE_ALL)

    investigation = correspondences.merge(identities, on='eligibility_result_id').merge(
        touched.add_prefix('lamp01_'), left_on='id_psp', right_on='lamp01_id_psp', how='left')
    investigation = pd.DataFrame({
        'verdict': investigation['eligibility_result_id'].map(
            lambda rid: 'doublon' if rid in doublon_type else 'a_verifier'),
        'type': investigation['type'],
        'reference': investigation['reference'],
        'lien': investigation['lien'],
        'saisie_nom': investigation['nom'],
        'saisie_prenom': investigation['prenom'],
        'saisie_date_naissance': investigation['date_naissance'],
        'saisie_genre': investigation['genre'],
        'saisie_situation': investigation['situation'],
        'saisie_caisse': investigation['caisse'],
        'saisie_allocataire_nom': investigation['allocataire_nom'],
        'saisie_allocataire_prenom': investigation['allocataire_prenom'],
        'saisie_allocataire_genre': investigation['allocataire_genre'],
        'saisie_allocataire_date_naissance': investigation['allocataire_date_naissance'],
        'saisie_email': investigation['email'],
        **{f'lamp01_{column}': investigation[f'lamp01_{column}'] for column in TOUCHED_COLUMNS},
    })
    _write(investigation.sort_values(['reference', 'type']), investigation_filepath,
           INVESTIGATION_COLUMNS)

    return {
        'lus': len(identities),
        'doublons': int(is_doublon.sum()),
        'a_verifier': int(is_review.sum()),
        'a_coder': int((verdict == 'a_coder').sum()),
        'rejets': len(rejects),
        'investigation': str(investigation_filepath),
    }


# --- retours ----------------------------------------------------------------------------

class Journal:
    """retours.csv: one line per action and verdict, fsynced, so a killed run keeps them."""

    def __init__(self, filepath):
        self.filepath = Path(filepath)
        self.done = set()
        if self.filepath.exists() and self.filepath.stat().st_size:
            previous = _read(self.filepath)
            done = previous[previous['statut'] == 'fait']
            self.done = set(zip(done['reference'], done['action'], strict=True))
        self.counts = {'fait': 0, 'simule': 0, 'erreur': 0}

    def is_done(self, reference: str, action: str) -> bool:
        return (reference, action) in self.done

    def record(self, reference: str, action: str, statut: str, detail: str = '') -> None:
        new_file = not self.filepath.exists() or self.filepath.stat().st_size == 0
        with self.filepath.open('a', encoding='utf-8', newline='') as handle:
            writer = csv.writer(handle, delimiter=';')
            if new_file:
                writer.writerow(JOURNAL_COLUMNS)
            writer.writerow([reference, action, statut, detail.replace('\n', ' '),
                             datetime.now().isoformat(timespec='seconds')])
            handle.flush()
            os.fsync(handle.fileno())
        self.counts[statut] += 1
        if statut == 'fait':
            self.done.add((reference, action))


def _codes(codes_filepath) -> dict:
    """eligibility_result_id -> code, from the run's writeback.csv (absent: nothing was coded)."""
    path = Path(codes_filepath) if codes_filepath else None
    if path is None or not path.exists():
        return {}
    codes = _read(path)
    return dict(zip(codes['eligibility_result_id'], codes['id_psp'], strict=True))


def final_statuses(verdicts: pd.DataFrame, refused: bool = False) -> pd.DataFrame:
    """Each line's outcome: a coded line is handed its code by its dossier's message, unless
    production refused the drop (refuse_prod)."""
    coded = verdicts['verdict'].map({'a_coder': 'refuse_prod' if refused else 'code_envoye'})
    return verdicts.assign(statut=coded.fillna(verdicts['verdict']))


def dn_decision(lines: pd.DataFrame) -> tuple[str, bool]:
    """(label key, accept?) for one dossier's lines."""
    statuts = set(lines['statut'])
    if 'a_verifier' in statuts or 'refuse_prod' in statuts:
        return 'a_verifier', False
    if 'rejete' in statuts:
        return 'rejete', False
    return 'traite', True


def dn_message(lines: pd.DataFrame) -> str:
    text = '\n'.join(
        '- ' + mapping.DN_MESSAGE_LINE[row['statut']].format(
            prenom=row['prenom'], nom=row['nom'], email=row['email'], motif=row['motif'],
            code=row['code'])
        for _, row in lines.iterrows())
    return mapping.DN_MESSAGE.format(lignes=text)


def dn_annotation(lines: pd.DataFrame, current) -> str:
    """The codes annotation once this run's codes are appended to what it held; '' when the
    dossier got no new code."""
    kept = [line for line in (current or '').splitlines() if line.strip()]
    added = [mapping.DN_ANNOTATION_LINE.format(prenom=row['prenom'], nom=row['nom'], code=row['code'])
             for _, row in lines[lines['statut'] == 'code_envoye'].iterrows()]
    new = [line for line in added if line not in kept]
    return '\n'.join(kept + new) if new else ''


def _codes_annotation(dossier: dict) -> dict | None:
    wanted = mapping.fold(mapping.DN_ANNOTATION_CODES)
    return next((annotation for annotation in dossier.get('annotations') or []
                 if mapping.fold(annotation['label']) == wanted), None)


def _failure(error: Exception) -> str:
    if isinstance(error, (DnMutationError, DnApiError)):
        return f"refusé par DN : {error}"
    if isinstance(error, requests.RequestException):
        return f"sans réponse de DN ({type(error).__name__}) : vérifier le dossier avant de rejouer"
    return f"{type(error).__name__} : {error}"


def send_dn(lines: pd.DataFrame, labels: dict, annotations: dict, instructeurs: dict,
            journal: Journal, client, dry_run: bool) -> int:
    """Codes annotation, message, label, then acceptance, per dossier; returns how many were
    accepted. annotations: dossier number -> its codes annotation as fetched (None: missing);
    instructeurs: dossier number -> the instructeur it is answered as."""
    accepted = 0
    for number, dossier in lines.groupby('dossier_number', sort=True):
        reference = f'dn:{number}'
        dossier_id = dossier['dossier_id'].iloc[0]
        instructeur_id = instructeurs[str(number)]
        label_key, accept = dn_decision(dossier)
        annotation = annotations.get(str(number))
        codes = dn_annotation(dossier, (annotation or {}).get('stringValue'))
        steps = [('annotation', codes)] if codes else []
        # Production refused the drop: the usager hears nothing until someone sorts it out.
        if not dossier['statut'].eq('refuse_prod').any():
            steps.append(('message', dn_message(dossier)))
        steps.append(('label', mapping.DN_LABELS[label_key]))
        if accept:
            steps.append(('accepter', mapping.DN_ACCEPT_MOTIVATION))

        for action, detail in steps:
            if journal.is_done(reference, action):
                continue
            if action == 'annotation' and annotation is None:
                journal.record(reference, action, 'erreur',
                               f"annotation privée « {mapping.DN_ANNOTATION_CODES} » absente du dossier")
                break
            if dry_run:
                journal.record(reference, action, 'simule', detail)
                continue
            try:
                if action == 'annotation':
                    client.annoter(dossier_id, instructeur_id, annotation['id'], detail)
                elif action == 'message':
                    client.envoyer_message(dossier_id, instructeur_id, detail)
                elif action == 'label':
                    client.ajouter_label(dossier_id, labels[label_key])
                else:
                    client.accepter(dossier_id, instructeur_id, mapping.DN_ACCEPT_MOTIVATION)
            except Exception as error:  # noqa: BLE001 - one dossier never stops the others
                journal.record(reference, action, 'erreur', _failure(error))
                break
            journal.record(reference, action, 'fait', detail)
            accepted += action == 'accepter'
    return accepted


def retours(verdicts_filepath, codes_filepath, dn_filepath, journal_filepath, dry_run=False,
            dn_client=None, refused_drop='') -> dict:
    """refused_drop: the name of the drop production's injector filed in failed/, if it did."""
    verdicts = final_statuses(_read(verdicts_filepath), refused=bool(refused_drop))
    refused = verdicts['statut'] == 'refuse_prod'
    verdicts.loc[refused, 'motif'] = f"refusé par l'injecteur de production ({refused_drop})"
    verdicts['code'] = verdicts['eligibility_result_id'].map(_codes(codes_filepath)).fillna('')
    assert verdicts.loc[verdicts['statut'] == 'code_envoye', 'code'].ne('').all(), \
        "des lignes codées n'ont pas de code dans writeback.csv"
    journal = Journal(journal_filepath)

    accepted = 0
    if len(verdicts):
        dn_raw = json.loads(Path(dn_filepath).read_text(encoding='utf-8'))
        if dn_client is None and not dry_run:
            dn_client = DnClient(os.environ.get('DN_API_URL') or DEFAULT_API_URL,
                                 _required_env('DN_API_TOKEN'))
        annotations = {str(dossier['number']): _codes_annotation(dossier) for dossier in dn_raw['dossiers']}
        instructeurs = {str(dossier['number']): dn_instructeur_id(dossier)
                        for dossier in dn_raw['dossiers']}
        accepted = send_dn(verdicts, dn_raw['labels'], annotations, instructeurs, journal, dn_client,
                           dry_run)

    return {
        'lignes': len(verdicts),
        'refusees_par_la_production': int(refused.sum()),
        'dossiers_dn_acceptes': accepted,
        'actions_faites': journal.counts['fait'],
        'actions_simulees': journal.counts['simule'],
        'erreurs': journal.counts['erreur'],
        'journal': str(journal_filepath),
    }


# --- CLI --------------------------------------------------------------------------------

def print_stats(stats: dict) -> None:
    for key, value in stats.items():
        print(f"{key} : {value}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest='command', required=True)

    fetch_parser = subparsers.add_parser('fetch', help="DN -> JSON brut")
    fetch_parser.add_argument('--dn-out', required=True)
    fetch_parser.set_defaults(func=lambda a: fetch(a.dn_out))

    clean_parser = subparsers.add_parser('clean', help="JSON brut -> schéma PSP")
    clean_parser.add_argument('--dn-in', required=True)
    clean_parser.add_argument('--output', required=True)
    clean_parser.add_argument('--match-out', required=True)
    clean_parser.add_argument('--cnaf-extra-out', required=True)
    clean_parser.add_argument('--identities-out', required=True)
    clean_parser.add_argument('--rejects-out', required=True)
    clean_parser.set_defaults(func=lambda a: clean(
        a.dn_in, a.output, a.match_out, a.cnaf_extra_out, a.identities_out, a.rejects_out))

    split_parser = subparsers.add_parser('split', help="doublons / à vérifier / à coder")
    split_parser.add_argument('--input', required=True)
    split_parser.add_argument('--correspondences', required=True)
    split_parser.add_argument('--touched', required=True)
    split_parser.add_argument('--identities', required=True)
    split_parser.add_argument('--rejects', required=True)
    split_parser.add_argument('--to-code-out', required=True)
    split_parser.add_argument('--verdicts-out', required=True)
    split_parser.add_argument('--investigation-out', required=True)
    split_parser.set_defaults(func=lambda a: split(
        a.input, a.correspondences, a.touched, a.identities, a.rejects, a.to_code_out,
        a.verdicts_out, a.investigation_out))

    retours_parser = subparsers.add_parser('retours', help="annotation, message, label, acceptation DN")
    retours_parser.add_argument('--verdicts', required=True)
    retours_parser.add_argument('--codes', help="writeback.csv du passage (absent : aucun code)")
    retours_parser.add_argument('--dn-in', required=True)
    retours_parser.add_argument('--journal', required=True)
    retours_parser.add_argument('--dry-run', action='store_true')
    retours_parser.add_argument('--refus-production', default='',
                                help="nom du dépôt que l'injecteur de production a rangé dans failed/")
    retours_parser.set_defaults(func=lambda a: retours(
        a.verdicts, a.codes, a.dn_in, a.journal, a.dry_run, refused_drop=a.refus_production))

    args = parser.parse_args(argv)
    stats = args.func(args)
    print_stats(stats)
    if args.command == 'retours' and stats['erreurs']:
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
