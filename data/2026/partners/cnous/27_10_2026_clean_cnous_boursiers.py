"""Process - CNOUS/MSE boursiers delivered on 2026-10-27.

- Load the 7 boursier files kept from the delivery, each cleaned with the sequence of
  `clean_cnous.ipynb` (`cnous.clean_cnous_rows`), missing birth countries completed from
  `v_pays_territoire_2026.csv` before the FR default
- Drop the duplicates across the delivery: INE, then courriel
- Drop the boursiers lamp01 already holds: INE or courriel of a cnous row, or identity (nom,
  prénom, date de naissance, genre) of any row
- Serialize the JSON columns, add the production columns, draw one code per boursier
- Output to CSV
- Read-only look at `boursiers_etat.csv`, which the delivery mail does not describe

Run through `run_cnous_boursiers.sh`, never on its own: the script exports lamp01 for this
one and hands it a copy of the code list on a dry run, then checks the lamp01 injection,
drops the file in `/nfs/run` and injects lamp01 once production holds it.

| file | content, as the CNOUS describes it | processed |
|---|---|---|
| `boursiers_etat_OK` | perfect match on the pivot identity | yes |
| `boursiers_region_OK`, `boursiers_region_OK_2` | same, regional boursiers | yes |
| `boursiers_etat_OK_incomplet` | perfect match, MSE profile missing an attribute | yes |
| `boursiers_etat_ecart_mail`, `boursiers_region_ecart_mail` | minor gap, mostly the birthplace | yes |
| `boursiers_etat_ecart_mail_incomplet` | same, incomplete profile | yes |
| `boursiers_etat_ecart+` | wider gap or a different email | no |
| `boursiers_region_ecart_s_mail`, `boursiers_region_ecart+_mail`, `boursiers_region_non_rapproches` | | no |

Encoding: CNOUS -> utf-8, sep=`;`, the 19 named fields of the September export, without the
échelon.

The codes are not mailed by this run, see `../../linkmobility/1_email_campaign.ipynb`.
"""

import csv
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

# clean_cnous_lib sits next to this file, partners_lib and generate_codes_lib one level up,
# utils at the data/ root.
CNOUS_DIR = Path(__file__).resolve().parent
PARTNERS_DIR = CNOUS_DIR.parent
DATA_DIR = PARTNERS_DIR.parent.parent

for _root in (DATA_DIR, PARTNERS_DIR, CNOUS_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_cnous_lib as cnous  # noqa: E402
import generate_codes_lib as codes  # noqa: E402
import partners_lib as partners  # noqa: E402
from utils.codes_utils import load_existing_codes, save_codes  # noqa: E402

# Read in this order: the deduplication keeps the first occurrence, so a boursier delivered
# twice keeps their best match - perfect, then incomplete, then minor gap.
CNOUS_FILES = [
    'boursiers_etat_OK.csv',
    'boursiers_region_OK.csv',
    'boursiers_region_OK_2.csv',
    'boursiers_etat_OK_incomplet.csv',
    'boursiers_etat_ecart_mail.csv',
    'boursiers_region_ecart_mail.csv',
    'boursiers_etat_ecart_mail_incomplet.csv',
]

ETAT_FIRST_DELIVERY = 'boursiers_etat.csv'
ETAT_FILES_OF_16H20 = [
    'boursiers_etat_OK.csv',
    'boursiers_etat_OK_incomplet.csv',
    'boursiers_etat_ecart_mail.csv',
    'boursiers_etat_ecart_mail_incomplet.csv',
    'boursiers_etat_ecart+.csv',
]

pd.set_option('display.width', 200)
pd.set_option('display.max_columns', None)


def diagnostic_keys(df: pd.DataFrame) -> pd.DataFrame:
    """INE, pivot identity and whole-row fingerprint of raw CNOUS rows."""
    return pd.DataFrame({
        'ine': df['allocataire-matricule'].fillna('').str.strip().str.upper(),
        'identite': partners.build_lamp_deduplication_key(df, cnous.LAMP_IDENTITY_KEY_COLUMNS),
        'ligne_identique': pd.util.hash_pandas_object(df.fillna(''), index=False),
    })


def diagnose_etat_first_delivery(cnous_input_dir: Path, df_lamp: pd.DataFrame) -> None:
    """Where the rows of boursiers_etat.csv are found: in the 16:20 files, in lamp01."""
    etat = diagnostic_keys(cnous.read_raw_cnous_csv(cnous_input_dir / ETAT_FIRST_DELIVERY))
    print(f"{len(etat)} row(s) in {ETAT_FIRST_DELIVERY}")

    found_in, union = {}, {key: set() for key in etat.columns}
    for filename in ETAT_FILES_OF_16H20:
        keys = diagnostic_keys(cnous.read_raw_cnous_csv(cnous_input_dir / filename))
        found_in[filename] = {key: etat[key].isin(set(keys[key]) - {''}) for key in etat.columns}
        for key in etat.columns:
            union[key] |= set(keys[key]) - {''}
    found_in['union des fichiers de 16h20'] = {key: etat[key].isin(union[key]) for key in etat.columns}

    lamp_cnous = df_lamp[df_lamp['organisme'] == cnous.ORGANISME]
    found_in['lamp01'] = {
        'ine': etat['ine'].isin(set(lamp_cnous['allocataire_matricule'].str.strip().str.upper()) - {''}),
        'identite': etat['identite'].isin(set(
            partners.build_lamp_deduplication_key(df_lamp, cnous.LAMP_IDENTITY_KEY_COLUMNS))),
    }

    diagnostic = pd.DataFrame({
        source: {key: int(mask.sum()) for key, mask in masks.items()}
        for source, masks in found_in.items()
    }).T.astype('Int64')
    print(diagnostic.join((diagnostic / len(etat) * 100).round(1), rsuffix=' (%)'))

    union_16h20, lamp01 = found_in['union des fichiers de 16h20'], found_in['lamp01']
    nowhere = ~(union_16h20['ine'] | union_16h20['identite'] | lamp01['ine'] | lamp01['identite'])
    print(f"{int(nowhere.sum())} row(s) of {ETAT_FIRST_DELIVERY} found neither in the 16:20 files "
          f"nor in lamp01, by INE or identity")


def main() -> None:
    load_dotenv()

    cnous_input_dir = Path(os.environ['CNOUS_BOURSIERS_27_10_2026_DIR'])
    # Relative to this folder, as when the notebook ran from it
    cog_pays_input_filepath = CNOUS_DIR / os.environ.get(
        'COG_PAYS_PATHFILE_2026', '../v_pays_territoire_2026.csv')

    # Both set by run_cnous_boursiers.sh, in its run directory: a lamp01 export taken right
    # before this run, and where the coded rows go.
    lamp_beneficiaires_filepath = os.environ['LAMP_BENEFICIAIRES_EXPORT_PATHFILE_2026']
    base_output_filepath = Path(os.environ['DB_CNOUS_EXPORT_27_10_2026'])

    # The campaign's code list, or a copy of it on a dry run.
    existing_codes_filepath = os.environ['EXISTING_CODES_PATHFILE_2026']

    # Each file through the cleaning of clean_cnous.ipynb (see cnous.clean_cnous_rows), the
    # birth country first completed from the COG when MSE left it empty.
    df_cog_pays = pd.read_csv(cog_pays_input_filepath, dtype=str, keep_default_na=False)

    cleaned, reports = [], {}
    for filename in CNOUS_FILES:
        df_raw = cnous.read_raw_cnous_csv(cnous_input_dir / filename)
        df_clean, reports[filename] = cnous.clean_cnous_rows(df_raw, df_cog_pays)
        cleaned.append(df_clean.assign(fichier_source=filename))

    df_boursiers = pd.concat(cleaned, ignore_index=True)
    del cleaned

    # pays_fr_par_defaut also counts every birth in France, which the export leaves without a
    # code: it only tells something on the _incomplet files.
    df_clean_report = pd.DataFrame.from_dict(reports, orient='index')
    print(df_clean_report)

    unmapped_iso = sorted(set(df_boursiers.loc[
        df_boursiers['allocataire-pays_naissance'].isna(),
        'allocataire-code_iso_pays_naissance'].dropna()))
    if unmapped_iso:
        print(f"{len(unmapped_iso)} ISO birth-country code(s) without a country label: {unmapped_iso}")

    # Duplicates across the delivery: INE first, then courriel. Rows without a value for the
    # key are left alone (see cnous.drop_duplicates_on_key).
    df_unique, duplicate_ine_count = cnous.drop_duplicates_on_key(df_boursiers, 'allocataire-matricule')
    print(f"{duplicate_ine_count} row(s) sharing an INE with an earlier one were removed")

    df_unique, duplicate_email_count = cnous.drop_duplicates_on_key(df_unique, 'allocataire-courriel')
    print(f"{duplicate_email_count} row(s) sharing a courriel with an earlier one were removed")

    delivery_duplicates = df_boursiers.loc[
        df_boursiers.index.difference(df_unique.index), 'fichier_source']
    print(delivery_duplicates.value_counts())

    # lamp01, the base FranceConnect matches against, exported as text by run_cnous_boursiers.sh
    df_lamp = pd.read_csv(
        lamp_beneficiaires_filepath, sep=';', dtype=str, keep_default_na=False, encoding='utf-8')
    print(f"{len(df_lamp)} lamp01 beneficiary row(s) read from {lamp_beneficiaires_filepath}")

    df_new, df_known = cnous.split_already_in_lamp(df_unique, df_lamp)
    print(f"{len(df_known)} boursier(s) already in lamp01, removed")
    print(f"{len(df_new)} boursier(s) left to code")
    print(df_known.groupby(['fichier_source', 'motif']).size().unstack(fill_value=0))

    # Who was set aside and the code lamp01 holds for them, for a manual check
    already_in_lamp_filepath = base_output_filepath.with_name('deja-en-base.csv')
    df_known[[
        'fichier_source', 'motif', 'id_psp_existant', 'nom', 'prenom', 'date_naissance', 'genre',
        'allocataire-matricule', 'allocataire-courriel',
    ]].to_csv(already_in_lamp_filepath, sep=';', index=False, encoding='utf-8')
    print(f"{len(df_known)} row(s) written to {already_in_lamp_filepath}")

    # map allocataire json (+ the boursier's own birth details) and adresse_allocataire json,
    # as clean_cnous.ipynb does. The code organisme and telephone columns the shared
    # serializer indexes are added empty, right before serializing.
    df_final = cnous.add_missing_allocataire_columns(df_new)
    df_final = partners.add_allocataire_json_column(
        df_final, extra_fields=cnous.ALLOCATAIRE_JSON_EXTRA_FIELDS)
    df_final = partners.add_adresse_allocataire_json_column(df_final)

    # Production default columns, then one brand new code per boursier, drawn against every
    # code already handed out this campaign
    df_final = codes.add_production_default_columns(df_final)

    existing_codes = load_existing_codes(existing_codes_filepath)
    df_final = codes.assign_new_codes(df_final, existing_codes)
    print(f"{len(existing_codes)} existing code(s) read from {existing_codes_filepath}")

    df_final['date_naissance'] = df_final['date_naissance'].astype(str)
    df_final_jeune = cnous.select_output_columns(df_final)

    # Both injectors compare the file's physical lines with the rows COPY loads: one line break
    # inside a value fails the whole file, in production and in lamp01.
    has_line_break = df_final_jeune.apply(lambda column: column.astype(str).str.contains('[\r\n]'))
    assert not has_line_break.any().any(), has_line_break.sum()[lambda count: count > 0].to_dict()

    df_final_jeune.to_csv(
        base_output_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)
    print(f"{len(df_final_jeune)} df_final_jeune written to {base_output_filepath}")

    # Track the codes just handed out, now that the output file is written
    tracked_codes = save_codes(existing_codes_filepath, existing_codes | set(df_final_jeune['id_psp']))
    assert tracked_codes == len(existing_codes) + len(df_final_jeune)
    print(f"{tracked_codes} code(s) now tracked in {existing_codes_filepath}")

    # Run report, file by file
    summary = pd.DataFrame({
        'lus': df_clean_report['lus'],
        'retenus_apres_nettoyage': df_clean_report['retenus'],
        'doublons_dans_la_livraison': delivery_duplicates.value_counts(),
        'deja_dans_lamp01': df_known['fichier_source'].value_counts(),
        'codes_generes': df_final['fichier_source'].value_counts(),
    }).reindex(CNOUS_FILES).fillna(0).astype(int)
    summary.loc['total'] = summary.sum()

    assert (summary['retenus_apres_nettoyage'] - summary['doublons_dans_la_livraison']
            - summary['deja_dans_lamp01'] == summary['codes_generes']).all()
    print(summary)

    print(f"beneficiaires: {len(df_final_jeune)}")
    print(f"codes_generes: {len(df_final_jeune)}")
    print(f"genre_M: {len(df_final_jeune[df_final_jeune['genre'] == 'M'])}")
    print(f"genre_F: {len(df_final_jeune[df_final_jeune['genre'] == 'F'])}")
    print(df_final_jeune[['organisme', 'situation']].value_counts())

    diagnose_etat_first_delivery(cnous_input_dir, df_lamp)


if __name__ == '__main__':
    main()
