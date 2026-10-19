"""Python steps of run_grist_dn.sh: beneficiaries collected in Grist and Démarches Numériques.

    python grist_dn_pipeline.py fetch     # both APIs -> raw JSON of what is left to process
    python grist_dn_pipeline.py clean     # raw JSON -> PSP schema, match candidates, rejects
    python grist_dn_pipeline.py split     # match_grist_dn.sql output -> doublons / à vérifier / à coder
    python grist_dn_pipeline.py emails    # coded rows -> input of `pnpm codes:support-emails`
    python grist_dn_pipeline.py retours   # verdicts -> Grist Statut, DN codes annotation, message, label, acceptance

Code drawing and the prod/lamp01 split are the FranceConnect ones (fc_pipeline.py codes and
writeback), called directly by the shell script. Matching is NOT the FranceConnect one: see
match_grist_dn.sql.

API settings come from the environment (data/.env, loaded by the shell script).

See test_grist_dn_pipeline.py for the unit tests.
"""

import argparse
import csv
import json
import os
import re
import sys
import uuid
from collections import Counter
from datetime import date, datetime, timezone
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
from grist_client import UPDATE_BATCH_SIZE, GristClient  # noqa: E402

SOURCES = ('grist', 'dn')

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

# What every output carries to trace a line back to its Grist row or DN dossier.
SUIVI_COLUMNS = [
    'reference', 'source', 'grist_row_id', 'dossier_id', 'dossier_number', 'lien',
    'prenom', 'nom', 'date_naissance', 'email',
]
EXTRACTED_COLUMNS = [
    *SUIVI_COLUMNS, 'genre', 'situation_label', 'situation', 'caisse', 'ine',
    'allocataire_genre', 'allocataire_prenom', 'allocataire_nom', 'allocataire_matricule',
    'code_insee', 'code_postal', 'commune', 'voie', 'commentaire', 'motif',
]
# Exactly the production schema, plus the run-local key split_writeback drops.
CLEANED_COLUMNS = [
    'eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'genre', 'situation',
    'organisme', 'allocataire', 'adresse_allocataire',
]
# match_grist_dn.sql loads them with `header match`: same names, same order.
MATCH_COLUMNS = [
    'eligibility_result_id', 'situation', 'ine', 'nom', 'prenom', 'date_naissance', 'genre',
    'allocataire_genre', 'allocataire_nom', 'allocataire_prenom',
]
IDENTITY_COLUMNS = [
    'eligibility_result_id', *SUIVI_COLUMNS, 'genre', 'situation', 'caisse',
    'allocataire_prenom', 'allocataire_nom', 'allocataire_genre', 'commentaire',
]
REJECT_COLUMNS = [*SUIVI_COLUMNS, 'motif']
VERDICT_COLUMNS = ['eligibility_result_id', *SUIVI_COLUMNS, 'verdict', 'motif']
EMAIL_COLUMNS = [
    'id', 'code', 'email', 'nom', 'prenom', 'date_naissance', 'situation',
    'allocataire_prenom', 'allocataire_nom',
]
# The lamp01 side of a correspondence, as match_grist_dn.sql exports it.
TOUCHED_COLUMNS = [
    'id_psp', 'nom', 'prenom', 'date_naissance', 'genre', 'situation', 'organisme',
    'allocataire_qualite', 'allocataire_nom', 'allocataire_prenom', 'allocataire_courriel',
    'adresse_allocataire_code_insee', 'created_at',
]
INVESTIGATION_COLUMNS = [
    'verdict', 'type', 'reference', 'lien', 'saisie_nom', 'saisie_prenom',
    'saisie_date_naissance', 'saisie_genre', 'saisie_situation', 'saisie_caisse',
    'saisie_allocataire', 'saisie_allocataire_genre', 'saisie_email', 'saisie_commentaire',
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
# Stands for no commune (a Grist Numeric cell left at 0): left out of the address altogether.
NO_INSEE = '00000'
DATE_FORMATS = ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y')
CAF_MATRICULE_LENGTH = 7

GENDER_BY_GENRE = {'M': 'male', 'F': 'female'}


# --- shared helpers -------------------------------------------------------------------

def _text(value) -> str:
    if value is None:
        return ''
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, list):
        # Grist ChoiceList cells come as ['L', choice, ...].
        items = value[1:] if value and value[0] == 'L' else value
        return ', '.join(str(item) for item in items)
    return str(value).strip()


def _is_blank(value) -> bool:
    return _text(value) == ''


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


def normalize_caf_matricule(value) -> str:
    """A CAF n° allocataire: its first 7 digits, left-padded with zeros; '' without any digit."""
    digits = re.sub(r'\D', '', _text(value))[:CAF_MATRICULE_LENGTH]
    return digits.zfill(CAF_MATRICULE_LENGTH) if digits else ''


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

def fetch_grist(client: GristClient, table_id: str, motif_label: str = '') -> dict:
    """The rows support marked eligible and the pipeline has not tagged yet."""
    column_id_by_label = {mapping.fold(label): column_id
                          for label, column_id in client.columns(table_id).items()}
    labels = dict(mapping.GRIST_COLUMNS)
    if motif_label:
        labels['motif'] = motif_label
    column_ids = {name: column_id_by_label.get(mapping.fold(label)) for name, label in labels.items()}
    missing = [labels[name] for name, column_id in column_ids.items() if column_id is None]
    if missing:
        raise ValueError(f"colonnes Grist absentes : {', '.join(missing)}")

    records, ignored = [], 0
    for record in client.records(table_id):
        fields = {name: record['fields'].get(column_id) for name, column_id in column_ids.items()}
        eligible = mapping.fold(_text(fields['eligibilite'])) in mapping.GRIST_ELIGIBLE_VALUES
        if eligible and _is_blank(fields['statut']):
            records.append({'id': record['id'], 'fields': fields})
        else:
            ignored += 1

    return {'table': table_id, 'columns': column_ids, 'records': records, 'ignores': ignored}


def dn_skip_reason(dossier: dict) -> str:
    """Why the pipeline leaves a dossier alone, '' when it takes it: en instruction, filed
    through FranceConnect and holding none of its labels."""
    if dossier['state'] != 'en_instruction':
        return 'pas en instruction'
    if dossier.get('connectionUsager') != mapping.DN_CONNECTION_USAGER:
        return 'sans FranceConnect'
    ours = {mapping.fold(name) for name in mapping.DN_LABELS.values()}
    if any(mapping.fold(label['name']) in ours for label in dossier['labels']):
        return 'déjà labellisé'
    return ''


def fetch_dn(client: DnClient, numero: int) -> dict:
    """The dossiers en instruction, filed through FranceConnect, without the pipeline's labels."""
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


def fetch(grist_out, dn_out, sources=SOURCES) -> dict:
    stats = {}
    grist = {'records': [], 'columns': {}, 'ignores': 0}
    if 'grist' in sources:
        client = GristClient(_required_env('GRIST_API_URL'), _required_env('GRIST_API_KEY'),
                             _required_env('GRIST_DOC_ID'))
        grist = fetch_grist(client, _required_env('GRIST_TABLE_ID'),
                            os.environ.get('GRIST_COLONNE_MOTIF', ''))
    _write_json(grist, grist_out)
    stats['grist_lignes'] = len(grist['records'])
    stats['grist_ignorees'] = grist['ignores']

    dn = {'dossiers': [], 'labels': {}, 'ignores': 0}
    if 'dn' in sources:
        client = DnClient(os.environ.get('DN_API_URL') or DEFAULT_API_URL, _required_env('DN_API_TOKEN'))
        dn = fetch_dn(client, int(_required_env('DN_DEMARCHE_NUMBER')))
    _write_json(dn, dn_out)
    stats['dn_dossiers'] = len(dn['dossiers'])
    stats['dn_ignores'] = dn['ignores']
    stats['dn_ignores_par_motif'] = dn.get('ignores_par_motif', {})
    return stats


# --- extraction: one line per beneficiary -----------------------------------------------

def _grist_date(value) -> str:
    # Grist Date columns come as seconds since the epoch, at midnight UTC.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return datetime.fromtimestamp(value, tz=timezone.utc).strftime('%Y-%m-%d')
    return _text(value)


def grist_rows(raw: dict) -> list[dict]:
    rows = []
    for record in raw.get('records', []):
        fields = record['fields']
        situation = mapping.situation_of_label(_text(fields['situation'])) or ''
        matricule = _text(fields['matricule'])
        rows.append({
            'reference': f"grist:{record['id']}",
            'source': 'grist',
            'grist_row_id': str(record['id']),
            'prenom': _text(fields['prenom']),
            'nom': _text(fields['nom']),
            'date_naissance': _grist_date(fields['date_naissance']),
            'email': _text(fields['email']),
            'genre': _text(fields['genre']),
            'situation_label': _text(fields['situation']),
            'situation': situation,
            'caisse': _text(fields['caisse']),
            # The n° allocataire is kept in lamp01 but never matched on; the INE is.
            'ine': matricule if situation == 'boursier' else '',
            'allocataire_genre': _text(fields['allocataire_genre']),
            'allocataire_prenom': _text(fields['allocataire_prenom']),
            'allocataire_nom': _text(fields['allocataire_nom']),
            'allocataire_matricule': matricule,
            'code_insee': _text(fields['code_insee']),
            'commentaire': _text(fields['commentaire']),
        })
    return rows


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


def _enfant_row(row: dict, common: dict, number: str, index: int, foyer: bool) -> dict:
    enfant = _champs_by_label(row.get('champs'))
    labels = mapping.DN_ENFANT_CHAMPS
    aeeh = _champ_yes(_champ(enfant, labels['aeeh']))
    situation = 'AEEH' if aeeh else ('jeune' if foyer else '')
    return {
        **common,
        'reference': f'dn:{number}:enfant-{index}',
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
        'source': 'dn',
        'dossier_id': dossier['id'],
        'dossier_number': number,
        'lien': DN_DOSSIER_URL.format(demarche=demarche, dossier=number),
        'email': _text(email),
        'caisse': _champ_text(_champ(champs, labels['caisse'])),
        'code_insee': _text(address.get('cityCode')),
        'code_postal': _text(address.get('postalCode')),
        'commune': _text(address.get('cityName')),
        'voie': _text(address.get('streetAddress')),
        'allocataire_genre': (_champ_text(_champ(champs, labels['allocataire_genre']))
                              or _text(demandeur.get('civilite'))),
        'allocataire_prenom': _text(demandeur.get('prenom')),
        'allocataire_nom': _text(demandeur.get('nom')),
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
            'date_naissance': _champ_date(_champ(champs, labels['date_naissance'])),
            'situation_label': beneficiaire_de,
            'situation': self_situation,
            'ine': ine,
            'allocataire_matricule': ine,
        })

    # A block answered "no children" may still carry rows typed before that answer.
    if not _champ_no(_champ(champs, labels['a_des_enfants'])):
        foyer = _champ_yes(_champ(champs, labels['foyer_qf_aeeh']))
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


def extract(grist_raw: dict, dn_raw: dict) -> pd.DataFrame:
    rows = grist_rows(grist_raw) + dn_rows(dn_raw)
    return pd.DataFrame(rows, columns=EXTRACTED_COLUMNS).fillna('')


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
    valid['genre'] = valid['genre'].map(_genre)
    valid['allocataire_genre'] = valid['allocataire_genre'].map(_genre)
    valid['email'] = valid['email'].str.lower()
    valid['code_insee'] = valid['code_insee'].map(lambda v: normalize_insee(v) if v else '').replace(NO_INSEE, '')
    valid['organisme'] = [
        fc.ORGANISME_BOURSIER if situation == 'boursier'
        else mapping.organisme_of_caisse(caisse)
        for situation, caisse in zip(valid['situation'], valid['caisse'], strict=True)
    ]
    caf = valid['organisme'] == 'CAF'
    valid.loc[caf, 'allocataire_matricule'] = valid.loc[caf, 'allocataire_matricule'].map(
        normalize_caf_matricule)
    return valid, df[df['motif'] != '']


def drop_duplicates(valid: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """The same person twice in the batch (in one source or across both): the first wins."""
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
    df = partners.add_allocataire_json_column(df)
    df = partners.add_adresse_allocataire_json_column(df)
    return partners.shift_birthdate_by_hours(df)


def build_match_candidates(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """The names as typed: match_grist_dn.sql normalises both sides with the same function."""
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
    })[MATCH_COLUMNS]


def build_cnaf_extra_field_rows(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """Filled for AAH CAF only, like the AAH support pipeline: without it the FranceConnect
    aah_caf strategy never finds the code again and the site would mint a second one."""
    aah_caf = (valid['situation'] == 'AAH') & (valid['organisme'] == 'CAF')
    return pd.DataFrame({
        'eligibility_result_id': psp['eligibility_result_id'],
        'cnaf_allocataire_nom_naissance': psp['nom'].where(aah_caf, ''),
        'cnaf_allocataire_date_naissance': valid['date_naissance'].where(aah_caf, ''),
        'cnaf_allocataire_genre': valid['genre'].map(GENDER_BY_GENRE).where(aah_caf, ''),
    })[['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS]]


def build_identities(psp: pd.DataFrame, valid: pd.DataFrame) -> pd.DataFrame:
    """What the mails, the DN messages and the investigation show: names as typed."""
    on_self = valid['situation'].isin(SELF_SITUATIONS)
    return valid.assign(
        eligibility_result_id=psp['eligibility_result_id'],
        allocataire_prenom=valid['prenom'].where(on_self, valid['allocataire_prenom']),
        allocataire_nom=valid['nom'].where(on_self, valid['allocataire_nom']),
        allocataire_genre=valid['genre'].where(on_self, valid['allocataire_genre']),
    ).reindex(columns=IDENTITY_COLUMNS)


def clean(grist_filepath, dn_filepath, output_filepath, match_filepath, cnaf_extra_filepath,
          identities_filepath, rejects_filepath) -> dict:
    grist_raw = json.loads(Path(grist_filepath).read_text(encoding='utf-8'))
    dn_raw = json.loads(Path(dn_filepath).read_text(encoding='utf-8'))

    extracted = extract(grist_raw, dn_raw)
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
        'lignes_grist': int((extracted['source'] == 'grist').sum()),
        'lignes_dn': int((extracted['source'] == 'dn').sum()),
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
        "le fichier des correspondances ne vient pas de match_grist_dn.sql"

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
        'saisie_allocataire': investigation['allocataire_prenom'] + ' ' + investigation['allocataire_nom'],
        'saisie_allocataire_genre': investigation['allocataire_genre'],
        'saisie_email': investigation['email'],
        'saisie_commentaire': investigation['commentaire'],
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


# --- emails -----------------------------------------------------------------------------

def build_emails(with_codes_filepath, identities_filepath, output_filepath) -> dict:
    """One line per coded beneficiary, in the shape `pnpm codes:support-emails` reads."""
    with_codes = _read(with_codes_filepath, quoting=csv.QUOTE_ALL)
    identities = _read(identities_filepath)

    assert with_codes['id_psp'].ne('').all(), "des bénéficiaires n'ont pas de code"

    emails = with_codes[['eligibility_result_id', 'id_psp']].merge(
        identities, on='eligibility_result_id', how='left', validate='1:1', indicator=True)
    assert emails['_merge'].eq('both').all(), "des bénéficiaires codés n'ont pas d'identité"

    emails = emails.rename(columns={'eligibility_result_id': 'id', 'id_psp': 'code'})
    _write(emails, output_filepath, EMAIL_COLUMNS)

    return {'courriels': len(emails), 'sortie': str(output_filepath)}


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


def _delivered_ids(envois_filepath) -> set:
    path = Path(envois_filepath) if envois_filepath else None
    if path is None or not path.exists() or not path.stat().st_size:
        return set()
    envois = _read(path)
    return set(envois.loc[envois['statut'].isin(['envoye', 'simule']), 'id'])


def _codes(codes_filepath) -> dict:
    """eligibility_result_id -> code, from the run's writeback.csv (absent: nothing was coded)."""
    path = Path(codes_filepath) if codes_filepath else None
    if path is None or not path.exists():
        return {}
    codes = _read(path)
    return dict(zip(codes['eligibility_result_id'], codes['id_psp'], strict=True))


def final_statuses(verdicts: pd.DataFrame, delivered: set, refused: bool = False) -> pd.DataFrame:
    """Each line's outcome; a coded line whose mail has not left yet stays pending (''),
    unless production refused the drop (refuse_prod)."""
    statut = verdicts['verdict'].map({'rejete': 'rejete', 'doublon': 'doublon',
                                      'a_verifier': 'a_verifier'}).fillna('')
    coded = verdicts['verdict'] == 'a_coder'
    if refused:
        statut[coded] = 'refuse_prod'
    else:
        statut[coded & verdicts['eligibility_result_id'].isin(delivered)] = 'code_envoye'
    return verdicts.assign(statut=statut)


def grist_update(row, columns: dict) -> dict:
    statut = mapping.GRIST_STATUT[row['statut']]
    if columns.get('motif'):
        fields = {columns['statut']: statut, columns['motif']: row['motif']}
    else:
        fields = {columns['statut']: f"{statut} : {row['motif']}" if row['motif'] else statut}
    return {'id': int(row['grist_row_id']), 'fields': fields}


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


def send_grist(lines: pd.DataFrame, columns: dict, journal: Journal, client, table_id,
               dry_run: bool) -> None:
    pending = [row for _, row in lines.iterrows() if not journal.is_done(row['reference'], 'statut')]
    if dry_run:
        for row in pending:
            journal.record(row['reference'], 'statut', 'simule',
                           json.dumps(grist_update(row, columns)['fields'], ensure_ascii=False))
        return

    for start in range(0, len(pending), UPDATE_BATCH_SIZE):
        batch = pending[start:start + UPDATE_BATCH_SIZE]
        try:
            client.update_records(table_id, [grist_update(row, columns) for row in batch])
            for row in batch:
                journal.record(row['reference'], 'statut', 'fait', mapping.GRIST_STATUT[row['statut']])
        except requests.RequestException:
            # One bad row (deleted meanwhile) fails its whole batch: retry them one by one.
            for row in batch:
                try:
                    client.update_records(table_id, [grist_update(row, columns)])
                    journal.record(row['reference'], 'statut', 'fait', mapping.GRIST_STATUT[row['statut']])
                except requests.RequestException as error:
                    journal.record(row['reference'], 'statut', 'erreur', f"Grist : {error}")


def send_dn(lines: pd.DataFrame, labels: dict, annotations: dict, journal: Journal, client,
            instructeur_id, dry_run: bool) -> int:
    """Codes annotation, message, label, then acceptance, per dossier; returns how many were
    accepted. annotations: dossier number -> its codes annotation as fetched (None: missing)."""
    accepted = 0
    for number, dossier in lines.groupby('dossier_number', sort=True):
        reference = f'dn:{number}'
        dossier_id = dossier['dossier_id'].iloc[0]
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


def retours(verdicts_filepath, envois_filepath, codes_filepath, grist_filepath, dn_filepath,
            journal_filepath, dry_run=False, grist_client=None, dn_client=None,
            refused_drop='') -> dict:
    """refused_drop: the name of the drop production's injector filed in failed/, if it did."""
    verdicts = final_statuses(_read(verdicts_filepath), _delivered_ids(envois_filepath),
                              refused=bool(refused_drop))
    refused = verdicts['statut'] == 'refuse_prod'
    verdicts.loc[refused, 'motif'] = f"refusé par l'injecteur de production ({refused_drop})"
    verdicts['code'] = verdicts['eligibility_result_id'].map(_codes(codes_filepath)).fillna('')
    assert verdicts.loc[verdicts['statut'] == 'code_envoye', 'code'].ne('').all(), \
        "des lignes au mail parti n'ont pas de code dans writeback.csv"
    journal = Journal(journal_filepath)
    pending = verdicts['statut'] == ''

    grist_lines = verdicts[(verdicts['source'] == 'grist') & ~pending]
    if len(grist_lines):
        grist_raw = json.loads(Path(grist_filepath).read_text(encoding='utf-8'))
        if grist_client is None and not dry_run:
            grist_client = GristClient(_required_env('GRIST_API_URL'), _required_env('GRIST_API_KEY'),
                                       _required_env('GRIST_DOC_ID'))
        send_grist(grist_lines, grist_raw['columns'], journal, grist_client, grist_raw.get('table'),
                   dry_run)

    dn_all = verdicts[verdicts['source'] == 'dn']
    # A dossier speaks once, with all its lines settled.
    waiting = set(dn_all.loc[pending[dn_all.index], 'dossier_number'])
    dn_lines = dn_all[~dn_all['dossier_number'].isin(waiting)]
    accepted = 0
    if len(dn_lines):
        dn_raw = json.loads(Path(dn_filepath).read_text(encoding='utf-8'))
        instructeur_id = os.environ.get('DN_INSTRUCTEUR_ID', '')
        if dn_client is None and not dry_run:
            dn_client = DnClient(os.environ.get('DN_API_URL') or DEFAULT_API_URL,
                                 _required_env('DN_API_TOKEN'))
            instructeur_id = _required_env('DN_INSTRUCTEUR_ID')
        annotations = {str(dossier['number']): _codes_annotation(dossier) for dossier in dn_raw['dossiers']}
        accepted = send_dn(dn_lines, dn_raw['labels'], annotations, journal, dn_client,
                           instructeur_id, dry_run)

    return {
        'lignes': len(verdicts),
        'refusees_par_la_production': int(refused.sum()),
        'en_attente_du_mail': int(pending.sum()),
        'dossiers_dn_en_attente': len(waiting),
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


def _cmd_fetch(args) -> dict:
    sources = [s.strip() for s in os.environ.get('GRIST_DN_SOURCES', ','.join(SOURCES)).split(',')
               if s.strip()]
    unknown = set(sources) - set(SOURCES)
    if unknown:
        raise SystemExit(f"GRIST_DN_SOURCES : source(s) inconnue(s) {', '.join(sorted(unknown))}")
    return fetch(args.grist_out, args.dn_out, sources)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest='command', required=True)

    fetch_parser = subparsers.add_parser('fetch', help="Grist + DN -> JSON brut")
    fetch_parser.add_argument('--grist-out', required=True)
    fetch_parser.add_argument('--dn-out', required=True)
    fetch_parser.set_defaults(func=_cmd_fetch)

    clean_parser = subparsers.add_parser('clean', help="JSON brut -> schéma PSP")
    clean_parser.add_argument('--grist-in', required=True)
    clean_parser.add_argument('--dn-in', required=True)
    clean_parser.add_argument('--output', required=True)
    clean_parser.add_argument('--match-out', required=True)
    clean_parser.add_argument('--cnaf-extra-out', required=True)
    clean_parser.add_argument('--identities-out', required=True)
    clean_parser.add_argument('--rejects-out', required=True)
    clean_parser.set_defaults(func=lambda a: clean(
        a.grist_in, a.dn_in, a.output, a.match_out, a.cnaf_extra_out, a.identities_out,
        a.rejects_out))

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

    emails_parser = subparsers.add_parser('emails', help="entrée de pnpm codes:support-emails")
    emails_parser.add_argument('--with-codes', required=True)
    emails_parser.add_argument('--identities', required=True)
    emails_parser.add_argument('--output', required=True)
    emails_parser.set_defaults(func=lambda a: build_emails(a.with_codes, a.identities, a.output))

    retours_parser = subparsers.add_parser(
        'retours', help="statut Grist, annotation/message/label/acceptation DN")
    retours_parser.add_argument('--verdicts', required=True)
    retours_parser.add_argument('--envois', help="journal des mails (absent : aucun code)")
    retours_parser.add_argument('--codes', help="writeback.csv du passage (absent : aucun code)")
    retours_parser.add_argument('--grist-in', required=True)
    retours_parser.add_argument('--dn-in', required=True)
    retours_parser.add_argument('--journal', required=True)
    retours_parser.add_argument('--dry-run', action='store_true')
    retours_parser.add_argument('--refus-production', default='',
                                help="nom du dépôt que l'injecteur de production a rangé dans failed/")
    retours_parser.set_defaults(func=lambda a: retours(
        a.verdicts, a.envois, a.codes, a.grist_in, a.dn_in, a.journal, a.dry_run,
        refused_drop=a.refus_production))

    args = parser.parse_args(argv)
    stats = args.func(args)
    print_stats(stats)
    if args.command == 'retours' and (stats['erreurs'] or stats['en_attente_du_mail']):
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
