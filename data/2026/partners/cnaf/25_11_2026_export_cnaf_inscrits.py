"""Export to the CNAF of its beneficiaries who activated their 2026 pass, with its own values.

    25_11_2026_export_cnaf_inscrits.py <inscrits-AAAA-MM-JJTHH-MM-SS.csv>

The input is the output of extraction_inscrits.sql (production LCA database, exercice 5,
inscriptions in state 1-4). The two raw CNAF files come from data/.env:
- CNAF_PATHFILE_2026        the file clean_cnaf_1_before_qf_batch.ipynb reads
- CNAF_PATHFILE_10_06_2026  the AEEH file 10_06_2026_clean_cnaf_aeeh.ipynb reads

- Keep the CAF inscrits that have a matricule
- Find each one again in the raw files, on matricule + child nom, prenom and birthdate
  (see cnaf_inscrits_lib)
- Write the matched rows, with the CNAF's raw values and sorted by CODORG, to
  cnaf-<input file name>
- Write the identifiers of the inscrits that were not found to
  cnaf-non-retrouves-<timestamp>.csv, next to it
"""

import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

# cnaf_inscrits_lib and clean_cnaf_lib sit next to this file, partners_lib one level up,
# utils at the data/ root.
CNAF_DIR = Path(__file__).resolve().parent
PARTNERS_DIR = CNAF_DIR.parent
DATA_DIR = PARTNERS_DIR.parent.parent

for _root in (DATA_DIR, PARTNERS_DIR, CNAF_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_cnaf_lib as cnaf  # noqa: E402
import cnaf_inscrits_lib as inscrits  # noqa: E402
import partners_lib as partners  # noqa: E402

ACTIVATED_ETATS = {'1', '2', '3', '4'}

INSCRITS_COLUMNS = [
    'inscription_id', 'beneficiaire_id', 'id_etat', 'id_psp', 'nom', 'prenom',
    'date_naissance', 'organisme', 'situation', 'allocataire_matricule',
]


def main() -> None:
    load_dotenv()
    # The files below carry identities.
    os.umask(0o007)

    if len(sys.argv) != 2:
        sys.exit(f"usage : {sys.argv[0]} <inscrits-AAAA-MM-JJTHH-MM-SS.csv>")
    inscrits_filepath = Path(sys.argv[1])

    cnaf_filepath = os.environ['CNAF_PATHFILE_2026']
    cnaf_aeeh_filepath = os.environ['CNAF_PATHFILE_10_06_2026']
    output_filepath = inscrits_filepath.with_name(f"cnaf-{inscrits_filepath.name}")
    unmatched_filepath = inscrits_filepath.with_name(
        f"cnaf-non-retrouves-{inscrits_filepath.name.removeprefix('inscrits-')}")

    # --- raw CNAF files
    df_first = cnaf.clean_raw_cnaf(cnaf.read_raw_cnaf_csv(cnaf_filepath))
    print(f"{len(df_first)} row(s) read from {cnaf_filepath}")

    df_aeeh = partners.strip_all_string_columns(cnaf.read_raw_cnaf_csv(
        cnaf_aeeh_filepath, columns=cnaf.CNAF_RAW_COLUMNS_10_06_2026, skiprows=1))
    print(f"{len(df_aeeh)} row(s) read from {cnaf_aeeh_filepath}")

    df_raw = inscrits.build_raw_candidates(df_first, df_aeeh)
    print(f"{len(df_raw)} distinct raw row(s) with a matricule and a child birthdate")

    # --- inscrits
    df_inscrits = pd.read_csv(inscrits_filepath, sep=';', dtype=str, keep_default_na=False,
                              encoding='utf-8')
    missing_columns = set(INSCRITS_COLUMNS) - set(df_inscrits.columns)
    assert not missing_columns, f"columns missing from {inscrits_filepath}: {sorted(missing_columns)}"
    assert set(df_inscrits['id_etat']) <= ACTIVATED_ETATS, \
        f"unexpected id_etat: {sorted(set(df_inscrits['id_etat']) - ACTIVATED_ETATS)}"
    print(f"{len(df_inscrits)} inscription(s) read from {inscrits_filepath}")

    is_caf = df_inscrits['organisme'].str.strip().str.upper() == inscrits.INSCRITS_ORGANISME
    without_matricule = is_caf & (df_inscrits['allocataire_matricule'].str.strip() == '')
    print(f"  - {is_caf.sum()} CAF, {without_matricule.sum()} of them without a matricule (left out)")

    df_selected = inscrits.select_cnaf_inscrits(df_inscrits)
    print(f"{len(df_selected)} CAF beneficiary(ies) with a matricule to find in the raw files")

    # --- match
    df_matched, df_unmatched, several_candidates_count = inscrits.match_inscrits(df_selected, df_raw)
    assert len(df_matched) + len(df_unmatched) == len(df_selected)

    print(f"{len(df_matched)} found, {len(df_unmatched)} not found")
    if len(df_unmatched):
        print(df_unmatched['situation'].value_counts().to_string())
    print(f"{several_candidates_count} beneficiary(ies) matching several raw rows, "
          "the one with the same situation kept (first file on a tie)")
    print(df_matched['fichier'].value_counts().sort_index()
          .rename(index={1: cnaf_filepath, 2: cnaf_aeeh_filepath}).to_string())

    # --- output
    df_output = inscrits.format_output(df_matched)
    duplicate_count = len(df_matched) - len(df_output)
    if duplicate_count:
        print(f"{duplicate_count} beneficiary(ies) sharing the very same raw row with another one, written once")

    assert (df_output['CODORG'] != '').all() and (df_output['MATRICULE'] != '').all()

    df_output.to_csv(output_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_output)} row(s) written to {output_filepath}")

    df_unmatched.to_csv(unmatched_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_unmatched)} identifier(s) of the inscrits not found written to {unmatched_filepath}")


if __name__ == '__main__':
    main()
