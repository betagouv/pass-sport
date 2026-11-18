"""Process - CPS (Saint-Pierre-et-Miquelon) beneficiaries, delivery of 2026-11-17.

    18_11_2026_clean_spm.py <fichier_cps.csv>

- Load the CPS file and file its rows as MSA, code organisme 459
- Clean them: birth name, casing, phone, street, birthplace and address codes
- Decide each situation (AAH / jeune / AEEH) and apply its eligibility window, QF < 700 on the
  QF route - the rejected rows go to rejets.csv with their motif
- Drop the duplicates within the file, then the beneficiaries lamp01 already holds
- Serialize the JSON columns, add the production columns, draw one code per beneficiary
- Output the production CSV and the input of `pnpm codes:partner-emails`

Run through `run_spm.sh`, never on its own: the runner exports lamp01 for this one, hands it a
copy of the code list on a dry run, checks the lamp01 injection, drops the file in `/nfs/run`,
injects lamp01 once production holds it, then mails the codes.

See README.md for the rules and their limits.
"""

import csv
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

# clean_spm_lib sits next to this file, partners_lib and generate_codes_lib one level up,
# utils at the data/ root.
SPM_DIR = Path(__file__).resolve().parent
PARTNERS_DIR = SPM_DIR.parent
DATA_DIR = PARTNERS_DIR.parent.parent

for _root in (DATA_DIR, PARTNERS_DIR, SPM_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_spm_lib as spm  # noqa: E402
import generate_codes_lib as codes  # noqa: E402
import partners_lib as partners  # noqa: E402
from utils.codes_utils import load_existing_codes, save_codes  # noqa: E402

pd.set_option('display.width', 200)
pd.set_option('display.max_columns', None)

REJECT_COLUMNS = [
    'motif', 'situation', 'qf_value', 'nom', 'prenom', 'date_naissance', 'genre',
    'allocataire-nom', 'allocataire-prenom',
]


def main() -> None:
    load_dotenv()

    if len(sys.argv) != 2:
        sys.exit(f"usage : {sys.argv[0]} <fichier_cps.csv>")
    input_filepath = Path(sys.argv[1])

    # All three set by run_spm.sh, in its run directory but for the code list: a lamp01 export
    # taken right before this run, where the coded rows go, and where the mails go.
    lamp_beneficiaires_filepath = os.environ['LAMP_BENEFICIAIRES_EXPORT_PATHFILE_2026']
    base_output_filepath = Path(os.environ['DB_SPM_EXPORT'])
    emails_output_filepath = Path(os.environ['DB_SPM_EMAILS'])
    rejects_filepath = base_output_filepath.with_name('rejets.csv')
    already_in_lamp_filepath = base_output_filepath.with_name('deja-en-base.csv')

    # The campaign's code list, or a copy of it on a dry run.
    existing_codes_filepath = os.environ['EXISTING_CODES_PATHFILE_2026']

    # --- load and map
    df_raw = spm.read_raw_spm_csv(input_filepath)
    print(f"{len(df_raw)} row(s) read from {input_filepath}")

    df = spm.map_spm_columns(df_raw)
    df = partners.strip_all_string_columns(df)
    df = spm.blank_to_nan(df)

    df, df_missing = spm.split_missing_required(df)
    print(f"{len(df_missing)} row(s) missing one of {spm.REQUIRED_COLUMNS}")

    # --- clean
    df, nom_naissance_count = spm.apply_nom_naissance(df)
    print(f"{nom_naissance_count} beneficiary(ies) filed under a birth name different from their nom")

    df = partners.normalize_identity_casing(df)
    spm.check_genre(df)
    df = partners.normalize_allocataire_qualite(df)
    df = partners.normalize_email_casing(df)

    df, two_phones_count = spm.normalize_phone(df)
    print(f"{two_phones_count} phone field(s) holding two numbers, the first one kept")
    print(f"{df['allocataire-telephone'].isna().sum()} allocataire(s) without a phone number")

    df = spm.build_voie(df)
    df, padded_count, cleared_count = spm.clean_birthplace(df)
    print(f"{padded_count} birth INSEE code(s) given back their leading zero")
    print(f"{cleared_count} foreign birth code(s) cleared, ISO country kept")
    df = spm.pad_address_codes(df)

    # --- situation and eligibility
    df = partners.parse_beneficiary_birthdate(df, date_format='%Y-%m-%d')
    df = spm.parse_qf(df)
    df = spm.assign_situation(df)
    print(df['situation'].value_counts())

    df_eligible, df_rejected = spm.select_eligible(df)
    if len(df_missing):
        df_rejected = pd.concat([df_rejected, df_missing])
    print(f"{len(df_rejected)} row(s) rejected")
    print(df_rejected['motif'].value_counts())

    df_rejected.reindex(columns=REJECT_COLUMNS).to_csv(
        rejects_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_rejected)} row(s) written to {rejects_filepath}")

    df_unique, duplicate_count = spm.drop_in_file_duplicates(df_eligible)
    print(f"{duplicate_count} duplicate(s) within the file removed")

    # --- JSON columns, then lamp01
    df_final = partners.add_allocataire_json_column(
        df_unique, extra_fields=spm.ALLOCATAIRE_JSON_EXTRA_FIELDS)
    df_final = partners.add_adresse_allocataire_json_column(df_final)

    df_lamp = pd.read_csv(
        lamp_beneficiaires_filepath, sep=';', dtype=str, keep_default_na=False, encoding='utf-8')
    print(f"{len(df_lamp)} lamp01 beneficiary row(s) read from {lamp_beneficiaires_filepath}")

    df_new, df_known = spm.split_already_in_lamp(df_final, df_lamp)
    df_known.reindex(columns=['id_psp_existant', 'situation', 'nom', 'prenom', 'date_naissance', 'genre']).to_csv(
        already_in_lamp_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_known)} beneficiary(ies) already in lamp01, written to {already_in_lamp_filepath}")
    print(f"{len(df_new)} beneficiary(ies) left to code")

    # --- production columns and codes
    df_new = partners.shift_birthdate_by_hours(df_new)
    df_new = codes.add_production_default_columns(df_new)

    existing_codes = load_existing_codes(existing_codes_filepath)
    print(f"{len(existing_codes)} existing code(s) read from {existing_codes_filepath}")
    df_new = codes.assign_new_codes(df_new, existing_codes)

    df_new['date_naissance'] = df_new['date_naissance'].astype(str)
    df_output = spm.select_output_columns(df_new)

    # Both injectors compare the file's physical lines with the rows COPY loads: one line break
    # inside a value fails the whole file, in production and in lamp01.
    has_line_break = df_output.apply(lambda column: column.astype(str).str.contains('[\r\n]'))
    assert not has_line_break.any().any(), has_line_break.sum()[lambda count: count > 0].to_dict()

    df_emails, no_email_count = spm.build_email_rows(df_new)

    df_output.to_csv(base_output_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    print(f"{len(df_output)} beneficiary(ies) written to {base_output_filepath}")

    df_emails.to_csv(emails_output_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_emails)} mail(s) written to {emails_output_filepath}, "
          f"{no_email_count} coded beneficiary(ies) without a courriel")

    # Track the codes just handed out, now that the output files are written
    tracked_codes = save_codes(existing_codes_filepath, existing_codes | set(df_output['id_psp']))
    assert tracked_codes == len(existing_codes) + len(df_output)
    print(f"{tracked_codes} code(s) now tracked in {existing_codes_filepath}")

    # --- report
    assert len(df_raw) == len(df_rejected) + duplicate_count + len(df_known) + len(df_output)
    print(f"lus: {len(df_raw)}")
    print(f"rejetes: {len(df_rejected)}")
    print(f"doublons_dans_le_fichier: {duplicate_count}")
    print(f"deja_dans_lamp01: {len(df_known)}")
    print(f"codes_generes: {len(df_output)}")
    print(f"genre_M: {len(df_output[df_output['genre'] == 'M'])}")
    print(f"genre_F: {len(df_output[df_output['genre'] == 'F'])}")
    print(df_output[['organisme', 'situation']].value_counts())
    print(df_emails['kind'].value_counts())


if __name__ == '__main__':
    main()
