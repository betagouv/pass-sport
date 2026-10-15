"""Python steps of run_aah_direct.sh: AAH beneficiaries handed over by the support team.

    python aah_direct_pipeline.py clean    # raw support CSV -> PSP schema + match candidates
    python aah_direct_pipeline.py known    # set aside who lamp01 already knows
    python aah_direct_pipeline.py emails   # coded rows -> input of `pnpm codes:aah-emails`

Code drawing and the prod/lamp01 split are the FranceConnect ones (fc_pipeline.py codes and
writeback), called directly by the shell script.

See test_aah_direct_pipeline.py for the unit tests.
"""

import argparse
import csv
import re
import sys
import unicodedata
import uuid
from pathlib import Path

import pandas as pd

SUPPORT_DIR = Path(__file__).resolve().parent
DATA_DIR = SUPPORT_DIR.parent.parent
PARTNERS_DIR = DATA_DIR / '2026' / 'partners'
FC_DIR = PARTNERS_DIR / 'franceconnect'

for _root in (DATA_DIR, PARTNERS_DIR, FC_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_fc_lib as fc  # noqa: E402
import partners_lib as partners  # noqa: E402

SITUATION = 'AAH'
# Same default as the FranceConnect AAH route; the CNAF extra-field row below is what lets
# the aah_caf strategy find these codes again.
ORGANISME = 'CAF'
CRITERE_AAH = 'aah'

# Support CSV header, keyed by its folded form (see _fold_header).
INPUT_COLUMNS = {
    'genre': 'genre',
    'prenom': 'prenom',
    'nom': 'nom',
    'date de naissance': 'date_naissance',
    'email': 'email',
    "critere d'eligibilite": 'critere',
}

DEDUPLICATION_KEY_COLUMNS = ['nom', 'prenom', 'date_naissance', 'genre']

# Exactly the production schema, plus the run-local key split_writeback drops.
CLEANED_COLUMNS = [
    'eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'genre', 'situation',
    'organisme', 'allocataire', 'adresse_allocataire',
]

IDENTITY_COLUMNS = ['eligibility_result_id', 'nom', 'prenom', 'date_naissance', 'email']
EMAIL_COLUMNS = ['id', 'code', 'email', 'nom', 'prenom', 'date_naissance']

GENDER_BY_GENRE = {'M': 'male', 'F': 'female'}
QUALITE_BY_GENRE = {genre: fc.QUALITE_BY_GENDER[gender] for genre, gender in GENDER_BY_GENRE.items()}

EMAIL_PATTERN = re.compile(r'^[^@\s;]+@[^@\s;]+\.[^@\s;]+$')


# --- clean ------------------------------------------------------------------------

def _fold_header(name: str) -> str:
    folded = unicodedata.normalize('NFKD', str(name)).encode('ascii', 'ignore').decode()
    return ' '.join(folded.replace('’', "'").lower().split())


def read_support_csv(input_filepath) -> pd.DataFrame:
    """The support CSV as stripped text, columns renamed to INPUT_COLUMNS values.

    Spreadsheet exports come as UTF-8 (with or without BOM) or cp1252, often with spaces
    around the separators.
    """
    raw = Path(input_filepath).read_bytes()
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')

    rows = [[cell.strip() for cell in row] for row in csv.reader(text.splitlines(), delimiter=';')]
    header, body = rows[0], rows[1:]

    columns = [INPUT_COLUMNS.get(_fold_header(name), name) for name in header]
    missing = [column for column in INPUT_COLUMNS.values() if column not in columns]
    if missing:
        raise ValueError(f"colonnes absentes du CSV : {', '.join(missing)} (en-tête lu : {header})")

    records = []
    for line_number, row in enumerate(body, start=2):
        if not any(row):
            continue
        cells = dict(zip(columns, row + [''] * (len(columns) - len(row))))
        records.append({'ligne': line_number, **{c: cells[c] for c in INPUT_COLUMNS.values()}})

    return pd.DataFrame(records, columns=['ligne', *INPUT_COLUMNS.values()])


def _rejection_reason(row) -> str:
    empty = [column for column in INPUT_COLUMNS.values() if not row[column]]
    if empty:
        return f"champ vide : {', '.join(empty)}"
    if row['genre'].upper() not in GENDER_BY_GENRE:
        return f"genre inconnu : {row['genre']}"
    if pd.isna(pd.to_datetime(row['date_naissance'], format='%d/%m/%Y', errors='coerce')):
        return f"date de naissance illisible (JJ/MM/AAAA attendu) : {row['date_naissance']}"
    if not EMAIL_PATTERN.match(row['email']):
        return f"email invalide : {row['email']}"
    if row['critere'].lower() != CRITERE_AAH:
        return f"critère d'éligibilité non pris en charge : {row['critere']}"
    return ''


def validate(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Splits the support rows into (valid, rejected), each rejected row with its `motif`."""
    df = df.copy()
    df['motif'] = df.apply(_rejection_reason, axis=1)

    readable = df['motif'] == ''
    birthdates = pd.to_datetime(
        df['date_naissance'].where(readable), format='%d/%m/%Y', errors='coerce')
    window = pd.DataFrame({'situation': SITUATION, 'date_naissance': birthdates[readable]})
    outside = readable & ~df.index.isin(partners.aah_eligible_index(window))
    df.loc[outside, 'motif'] = (
        'hors fenêtre AAH (' + partners.AAH_DOB_MIN.strftime('%d/%m/%Y') + ' - '
        + partners.AAH_DOB_MAX.strftime('%d/%m/%Y') + ') : ' + df.loc[outside, 'date_naissance'])

    valid = df[df['motif'] == ''].drop(columns='motif')
    valid = valid.assign(date_naissance=birthdates[valid.index])
    return valid, df[df['motif'] != '']


def to_psp(valid: pd.DataFrame) -> pd.DataFrame:
    """Valid support rows -> PSP columns, still carrying `ligne` and the raw identity."""
    df = pd.DataFrame({
        'ligne': valid['ligne'],
        'eligibility_result_id': [str(uuid.uuid4()) for _ in range(len(valid))],
        'nom': valid['nom'],
        'prenom': valid['prenom'],
        'date_naissance': valid['date_naissance'],
        'genre': valid['genre'].str.upper(),
        'situation': SITUATION,
        'organisme': ORGANISME,
        # The beneficiary is the allocataire on the AAH route.
        'allocataire-qualite': valid['genre'].str.upper().map(QUALITE_BY_GENRE),
        'allocataire-matricule': None,
        'allocataire-code_organisme': None,
        'allocataire-telephone': None,
        'allocataire-nom': valid['nom'],
        'allocataire-prenom': valid['prenom'],
        'allocataire-courriel': valid['email'],
        'adresse_allocataire-voie': None,
        'adresse_allocataire-code_postal': None,
        'adresse_allocataire-commune': None,
        'adresse_allocataire-code_insee': None,
        'adresse_allocataire-cplt_adresse': None,
        'raw_nom': valid['nom'],
        'raw_prenom': valid['prenom'],
    }, index=valid.index)

    df = partners.normalize_identity_casing(df)
    df = partners.normalize_email_casing(df)
    df = partners.add_allocataire_json_column(df)
    df = partners.add_adresse_allocataire_json_column(df)
    return partners.shift_birthdate_by_hours(df)


def build_match_candidates(df: pd.DataFrame) -> pd.DataFrame:
    """The match_beneficiaires.sql input: beneficiary identity only, as on the AAH route.

    The support team's `Nom` may be a birth or a usage name, so it is offered as both.
    """
    candidates = pd.DataFrame('', index=df.index, columns=fc.MATCH_COLUMNS)
    candidates['eligibility_result_id'] = df['eligibility_result_id']
    candidates['situation'] = df['situation']
    candidates['organisme'] = df['organisme']
    candidates['beneficiaire_nom'] = df['nom']
    candidates['beneficiaire_nom_usage'] = df['nom']
    candidates['beneficiaire_prenom'] = df['prenom']
    candidates['beneficiaire_date_naissance'] = df['date_naissance'].dt.strftime('%Y-%m-%d')
    candidates['beneficiaire_genre'] = df['genre']
    return candidates


def build_cnaf_extra_field_rows(df: pd.DataFrame) -> pd.DataFrame:
    """beneficiaire_cnaf_extra_field rows, without which aah_caf never finds these codes again."""
    return pd.DataFrame({
        'eligibility_result_id': df['eligibility_result_id'],
        'cnaf_allocataire_nom_naissance': df['nom'],
        'cnaf_allocataire_date_naissance': df['date_naissance'].dt.strftime('%Y-%m-%d'),
        'cnaf_allocataire_genre': df['genre'].map(GENDER_BY_GENRE),
    })[['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS]]


def build_identities(df: pd.DataFrame) -> pd.DataFrame:
    """What the mail renders: the names as the support team typed them, accents included."""
    return pd.DataFrame({
        'eligibility_result_id': df['eligibility_result_id'],
        'nom': df['raw_nom'],
        'prenom': df['raw_prenom'],
        'date_naissance': df['date_naissance'].dt.strftime('%Y-%m-%d'),
        'email': df['allocataire-courriel'],
    })[IDENTITY_COLUMNS]


def clean(input_filepath, output_filepath, match_filepath, cnaf_extra_filepath,
          identities_filepath, rejects_filepath) -> dict:
    raw = read_support_csv(input_filepath)
    valid, rejected = validate(raw)

    if valid.empty:
        return _write_empty_outputs(raw, rejected, output_filepath, match_filepath,
                                    cnaf_extra_filepath, identities_filepath, rejects_filepath)

    df = to_psp(valid)

    duplicated = df.duplicated(subset=DEDUPLICATION_KEY_COLUMNS, keep='first')
    first_line = df.groupby(DEDUPLICATION_KEY_COLUMNS)['ligne'].transform('first')
    duplicates = raw.loc[df.index[duplicated]].assign(
        motif='doublon de la ligne ' + first_line[duplicated].astype(str))
    df = df[~duplicated]

    pd.concat([rejected, duplicates]).sort_values('ligne').to_csv(
        rejects_filepath, sep=';', index=False, encoding='utf-8')

    df[CLEANED_COLUMNS].to_csv(
        output_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    build_match_candidates(df).to_csv(match_filepath, sep=';', index=False, encoding='utf-8')
    build_cnaf_extra_field_rows(df).to_csv(
        cnaf_extra_filepath, sep=';', index=False, encoding='utf-8')
    build_identities(df).to_csv(identities_filepath, sep=';', index=False, encoding='utf-8')

    return {
        'lignes_lues': len(raw),
        'lignes_rejetees': len(rejected),
        'doublons_retires': len(duplicates),
        'beneficiaires': len(df),
        'genre_M': int((df['genre'] == 'M').sum()),
        'genre_F': int((df['genre'] == 'F').sum()),
        'sortie': str(output_filepath),
        'rejets': str(rejects_filepath),
    }


def _write_empty_outputs(raw, rejected, output_filepath, match_filepath, cnaf_extra_filepath,
                        identities_filepath, rejects_filepath) -> dict:
    rejected.to_csv(rejects_filepath, sep=';', index=False, encoding='utf-8')
    for filepath, columns in (
        (output_filepath, CLEANED_COLUMNS),
        (match_filepath, fc.MATCH_COLUMNS),
        (cnaf_extra_filepath, ['eligibility_result_id', *fc.CNAF_EXTRA_FIELD_COLUMNS]),
        (identities_filepath, IDENTITY_COLUMNS),
    ):
        pd.DataFrame(columns=columns).to_csv(filepath, sep=';', index=False, encoding='utf-8')

    return {'lignes_lues': len(raw), 'lignes_rejetees': len(rejected), 'doublons_retires': 0,
            'beneficiaires': 0, 'rejets': str(rejects_filepath)}


# --- known ------------------------------------------------------------------------

def _read(filepath, **kwargs) -> pd.DataFrame:
    return pd.read_csv(filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False,
                       **kwargs)


def split_known(cleaned_filepath, matched_filepath, inconclusive_filepath, identities_filepath,
                output_filepath, known_filepath, to_review_filepath) -> dict:
    """Keeps only who lamp01 does not know at all.

    Matched people already hold a code: `known` lists it. Inconclusive ones were reached by
    some strategy without a single answer: a human decides, nobody mints them a code.
    """
    df = _read(cleaned_filepath, quoting=csv.QUOTE_ALL)
    matched = _read(matched_filepath)
    inconclusive = _read(inconclusive_filepath)
    identities = _read(identities_filepath)

    assert {'eligibility_result_id', 'id_psp'} <= set(matched.columns), \
        "le fichier des appariés ne vient pas de match_beneficiaires.sql"
    assert 'eligibility_result_id' in inconclusive.columns, \
        "le fichier des inconcluants ne vient pas de match_beneficiaires.sql"

    set_aside = set(matched['eligibility_result_id']) | set(inconclusive['eligibility_result_id'])
    remaining = df[~df['eligibility_result_id'].isin(set_aside)]

    identities.merge(matched, on='eligibility_result_id').drop(
        columns='eligibility_result_id').to_csv(known_filepath, sep=';', index=False, encoding='utf-8')
    identities[identities['eligibility_result_id'].isin(inconclusive['eligibility_result_id'])].drop(
        columns='eligibility_result_id').to_csv(to_review_filepath, sep=';', index=False, encoding='utf-8')

    remaining.to_csv(output_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)

    return {
        'lus': len(df),
        'deja_connus': len(matched),
        'a_verifier': len(inconclusive),
        'a_coder': len(remaining),
        'sortie': str(output_filepath),
    }


# --- emails -----------------------------------------------------------------------

def build_emails(with_codes_filepath, identities_filepath, output_filepath) -> dict:
    """One line per coded beneficiary, in the shape send-code-direct-aah.ts reads."""
    with_codes = _read(with_codes_filepath, quoting=csv.QUOTE_ALL)
    identities = _read(identities_filepath)

    assert with_codes['id_psp'].ne('').all(), "des bénéficiaires n'ont pas de code"

    emails = with_codes[['eligibility_result_id', 'id_psp']].merge(
        identities, on='eligibility_result_id', how='left', validate='1:1', indicator=True)
    assert emails['_merge'].eq('both').all(), "des bénéficiaires codés n'ont pas d'identité"

    emails = emails.rename(columns={'eligibility_result_id': 'id', 'id_psp': 'code'})
    emails[EMAIL_COLUMNS].to_csv(output_filepath, sep=';', index=False, encoding='utf-8')

    return {'courriels': len(emails), 'sortie': str(output_filepath)}


# --- CLI --------------------------------------------------------------------------

def print_stats(stats: dict) -> None:
    for key, value in stats.items():
        print(f"{key} : {value}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest='command', required=True)

    clean_parser = subparsers.add_parser('clean', help="CSV du support -> schéma PSP")
    clean_parser.add_argument('--input', required=True)
    clean_parser.add_argument('--output', required=True)
    clean_parser.add_argument('--match-out', required=True)
    clean_parser.add_argument('--cnaf-extra-out', required=True)
    clean_parser.add_argument('--identities-out', required=True)
    clean_parser.add_argument('--rejects-out', required=True)
    clean_parser.set_defaults(func=lambda a: clean(
        a.input, a.output, a.match_out, a.cnaf_extra_out, a.identities_out, a.rejects_out))

    known_parser = subparsers.add_parser('known', help="écarter ceux que lamp01 connaît")
    known_parser.add_argument('--input', required=True)
    known_parser.add_argument('--matched', required=True)
    known_parser.add_argument('--inconclusive', required=True)
    known_parser.add_argument('--identities', required=True)
    known_parser.add_argument('--output', required=True)
    known_parser.add_argument('--known-out', required=True)
    known_parser.add_argument('--to-review-out', required=True)
    known_parser.set_defaults(func=lambda a: split_known(
        a.input, a.matched, a.inconclusive, a.identities, a.output, a.known_out,
        a.to_review_out))

    emails_parser = subparsers.add_parser('emails', help="entrée de pnpm codes:aah-emails")
    emails_parser.add_argument('--with-codes', required=True)
    emails_parser.add_argument('--identities', required=True)
    emails_parser.add_argument('--output', required=True)
    emails_parser.set_defaults(func=lambda a: build_emails(a.with_codes, a.identities, a.output))

    args = parser.parse_args(argv)
    print_stats(args.func(args))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
