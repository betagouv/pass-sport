"""Les étapes Python de la source FranceConnect, en bibliothèque et en ligne de commande.

Le processus complet fait 4 étapes, décrites par README.md : une extraction SQL, un
nettoyage, une génération de codes, un write-back. Les trois qui sont du Python vivent ici,
derrière une CLI à trois sous-commandes :

    python fc_pipeline.py clean      # étape 2 — export brut -> schéma PSP
    python fc_pipeline.py codes      # étape 3 — un code par bénéficiaire
    python fc_pipeline.py writeback  # étape 4a — CSV de prod + couples pour le SQL

Ce module est le seul endroit où ces enchaînements existent : les notebooks du dossier
l'appellent, et run_fc_pipeline.sh — le point d'entrée de la cron — aussi. Un passage
automatique et un passage à la main font donc exactement la même chose.

Chaque fonction renvoie un dict de comptes plutôt que de les afficher : le notebook les
imprime, la cron les journalise, un test s'appuie dessus.

La logique métier, elle, n'est pas ici : le nettoyage appelle clean_fc_lib.py et
partners_lib.py, la génération de codes appelle ../generate_codes_lib.py.

Voir test_fc_pipeline.py pour les tests unitaires.
"""

import argparse
import csv
import os
import sys
from pathlib import Path

import pandas as pd

# Les modules appelés vivent à trois niveaux différents de data/ : ce fichier est aussi un
# script, lançable depuis n'importe quel dossier, il rend donc ces trois racines importables
# avant de les importer. Les notebooks font la même chose depuis leur propre dossier.
FC_DIR = Path(__file__).resolve().parent
PARTNERS_DIR = FC_DIR.parent
DATA_DIR = PARTNERS_DIR.parent.parent

for _root in (DATA_DIR, PARTNERS_DIR, FC_DIR):
    if str(_root) not in sys.path:
        sys.path.insert(0, str(_root))

import clean_fc_lib as fc  # noqa: E402
import generate_codes_lib as codes  # noqa: E402
import partners_lib as partners  # noqa: E402

# Nom FIGÉ, attendu tel quel par writeback_verdict.sql et check_writeback.sql : \copy est la
# seule commande psql qui n'interpole aucune variable dans ses arguments, le chemin ne peut
# donc pas lui être passé. Il est écrit à côté des .sql, c'est-à-dire dans ce dossier.
WRITEBACK_FILENAME = 'fc_2026_writeback.csv'

# Ce que l'identité pivot FranceConnect donne en plus du tronc commun des fichiers
# partenaires : ni la CNAF ni le CNOUS n'exportent la date et le lieu de naissance de
# l'allocataire.
ALLOCATAIRE_EXTRA_FIELDS = {
    'date_naissance': 'allocataire-date_naissance',
    'code_insee_commune_naissance': 'allocataire-code_insee_naissance',
    'code_pays_naissance': 'allocataire-code_pays_naissance',
}

SOURCE = 'FC'


# --- Étape 2 : nettoyage ----------------------------------------------------------

def clean(input_filepath, output_filepath) -> dict:
    """Transforme l'export brut de eligibility_results en CSV au schéma de production.

    L'export SQL sort en CSV standard (séparateur virgule). dtype=str et
    keep_default_na=False pour que rien ne soit deviné : les codes INSEE gardent leur zéro de
    tête et une chaîne "NA" reste une chaîne.
    """
    df = pd.read_csv(
        input_filepath, sep=',', encoding='utf-8', dtype=str, keep_default_na=False,
    )
    lignes_lues = len(df)

    # Genre des enfants : `enfant_identite` ne le porte pas, il est retrouvé par appariement
    # sur (nom, prénoms, date de naissance) dans le tableau `enfants` de la réponse quotient
    # familial. Un compte non nul mérite un coup d'œil : il signale un décalage entre
    # l'identité persistée et la réponse d'origine.
    df, genres_non_resolus = fc.resolve_enfant_genre(df)

    # Projection vers le schéma PSP : le bénéficiaire est l'enfant sur les lignes 'enfant',
    # l'allocataire connecté lui-même sur les lignes 'self'. Crée aussi la charpente
    # allocataire-* / adresse_allocataire-* que les sérialiseurs JSON consomment plus bas.
    df = fc.build_psp_columns(df)

    # Situation : quelle aide ouvre le droit. Reconstruite depuis les réponses brutes d'API
    # Particulier, en rejouant les règles de worker/src/lca/candidates.ts (fenêtres de
    # naissance et seuil de quotient compris). Puis l'organisme : la caisse d'où vient le
    # droit.
    df, sans_situation = fc.resolve_situation(df)
    df = fc.resolve_organisme(df)

    # Sérialisation des deux colonnes JSON du schéma de production. À faire AVANT le filtre
    # des lignes incomplètes : celui-ci supprime au passage les colonnes entièrement nulles,
    # et sur cette source la charpente l'est (ni matricule, ni code organisme, ni téléphone,
    # ni adresse postale — FranceConnect n'en fournit aucun).
    df = partners.add_allocataire_json_column(df, extra_fields=ALLOCATAIRE_EXTRA_FIELDS)
    df = partners.add_adresse_allocataire_json_column(df)

    # Retrait des colonnes de travail et de la charpente, désormais repliées dans les deux
    # colonnes JSON. eligibility_result_id survit : c'est la clé du write-back de l'étape 4.
    df = fc.drop_intermediate_columns(df)

    # Lignes inexploitables : sans l'une de ces valeurs on ne peut pas générer de code. On
    # ajoute `situation` aux colonnes obligatoires habituelles — une ligne sans route
    # identifiée n'a rien à faire en base.
    df_valid = partners.filter_rows_missing_required_fields(
        df, required_columns=partners.NECESSARY_COLUMNS + ['situation'])
    lignes_ecartees = len(df) - len(df_valid)

    # Mise en forme finale, identique aux autres sources.
    df_valid = partners.normalize_identity_casing(df_valid)
    if 'allocataire-courriel' in df_valid.columns:
        df_valid = partners.normalize_email_casing(df_valid)
    df_valid = partners.shift_birthdate_by_hours(df_valid)

    # Déduplication sur l'identité seule (voir fc.FC_DEDUPLICATION_KEY_COLUMNS) : un même
    # enfant peut être remonté par ses DEUX parents, chacun avec son propre sub. Garder le
    # sub ou le courriel dans la clé laisserait passer deux lignes, donc deux codes, pour un
    # seul bénéficiaire.
    df_final, doublons = partners.drop_duplicate_beneficiaries(
        df_valid, subset_columns=fc.FC_DEDUPLICATION_KEY_COLUMNS)

    # Garde-fous avant écriture : le CSV doit porter une clé de write-back par ligne, et pas
    # encore de code — c'est l'étape 3 qui les fabrique.
    assert df_final['eligibility_result_id'].notna().all()
    assert df_final['eligibility_result_id'].is_unique
    assert 'id_psp' not in df_final.columns

    # QUOTE_ALL et sep=';' : le format exact que relit l'étape 3.
    df_final.to_csv(
        output_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)

    return {
        'lignes_lues': lignes_lues,
        'genres_non_resolus': genres_non_resolus,
        'sans_situation': sans_situation,
        'lignes_ecartees': lignes_ecartees,
        'doublons_retires': doublons,
        'beneficiaires': len(df_final),
        'genre_M': len(df_final[df_final['genre'] == 'M']),
        'genre_F': len(df_final[df_final['genre'] == 'F']),
        'par_organisme_situation': df_final[['organisme', 'situation']].value_counts(),
        'sortie': str(output_filepath),
    }


# --- Étape 4a : découpage du fichier daté -----------------------------------------

def split_writeback(with_codes_filepath, writeback_filepath, prod_filepath) -> dict:
    """Sépare le fichier daté en couples pour le SQL et CSV de production.

    L'étape 3 recopie toutes les colonnes d'entrée et ne fait qu'en ajouter : le CSV qu'elle
    produit porte donc à la fois `eligibility_result_id` (venu de l'export SQL) et le
    `id_psp` fraîchement fabriqué. D'où deux fichiers :

      - `fc_2026_writeback.csv`, deux colonnes, entrée de writeback_verdict.sql ;
      - le CSV de prod, débarrassé de la colonne technique, qui n'existe que pour le
        write-back et n'a rien à faire dans la table des bénéficiaires.
    """
    df = pd.read_csv(
        with_codes_filepath, sep=';', encoding='utf-8', dtype=str, keep_default_na=False,
        quoting=csv.QUOTE_ALL,
    )

    # Garde-fous : sans ces deux colonnes le write-back n'a aucun sens, et un id_psp manquant
    # écrirait un code vide en base.
    assert 'eligibility_result_id' in df.columns, "colonne absente — le CSV ne vient pas de la source FC"
    assert 'id_psp' in df.columns, "colonne absente — l'étape 3 n'a pas tourné"
    assert df['eligibility_result_id'].ne('').all()
    assert df['id_psp'].ne('').all()
    assert df['eligibility_result_id'].is_unique
    assert df['id_psp'].is_unique

    # Le couple que writeback_verdict.sql attend, en-tête compris, séparateur ';'.
    df[['eligibility_result_id', 'id_psp']].to_csv(
        writeback_filepath, sep=';', index=False, encoding='utf-8')

    df.drop(columns=['eligibility_result_id']).to_csv(
        prod_filepath, sep=';', index=False, encoding='utf-8', quoting=csv.QUOTE_ALL)

    return {
        'beneficiaires': len(df),
        'writeback': str(writeback_filepath),
        'prod': str(prod_filepath),
    }


def prod_filepath_for(with_codes_filepath) -> str:
    """`AAAA-MM-JJ-fc-with-codes.csv` -> `AAAA-MM-JJ-fc-prod.csv`, au même endroit."""
    return str(with_codes_filepath).replace('-with-codes.csv', '-prod.csv')


# --- CLI ---------------------------------------------------------------------------

def print_stats(stats: dict) -> None:
    """Affiche les comptes d'une étape — les notebooks s'en servent aussi."""
    for key, value in stats.items():
        if isinstance(value, pd.Series):
            print(f"{key} :\n{value.to_string()}")
        else:
            print(f"{key} : {value}")


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"variable d'environnement manquante : {name}")
    return value


def _cmd_clean(args) -> dict:
    return clean(
        args.input or _required_env('FC_EXPORT_PATHFILE_2026'),
        args.output or _required_env('DB_FC_EXPORT_2026'),
    )


def _cmd_codes(args) -> dict:
    input_filepath = args.input or _required_env('DB_FC_EXPORT_2026')

    return codes.generate_codes_for_file(
        input_filepath,
        args.output or codes.dated_output_path(input_filepath, SOURCE),
        args.existing_codes or _required_env('EXISTING_CODES_PATHFILE_2026'),
    )


def _cmd_writeback(args) -> dict:
    with_codes = args.with_codes or os.environ.get('FC_WITH_CODES_PATHFILE_2026')
    if not with_codes:
        # Par défaut, le fichier que `codes` vient d'écrire aujourd'hui.
        with_codes = codes.dated_output_path(_required_env('DB_FC_EXPORT_2026'), SOURCE)

    return split_writeback(
        with_codes,
        args.writeback_out or str(FC_DIR / WRITEBACK_FILENAME),
        args.prod_out or prod_filepath_for(with_codes),
    )


def main(argv=None) -> int:
    # Les chemins vivent dans data/.env, comme pour les notebooks ; les options de ligne de
    # commande sont là pour les surcharger, notamment le chemin daté que le shell calcule.
    try:
        from dotenv import load_dotenv
        load_dotenv(DATA_DIR / '.env')
    except ImportError:
        pass

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest='command', required=True)

    clean_parser = subparsers.add_parser('clean', help="étape 2 — export brut -> schéma PSP")
    clean_parser.add_argument('--input', help="défaut : $FC_EXPORT_PATHFILE_2026")
    clean_parser.add_argument('--output', help="défaut : $DB_FC_EXPORT_2026")
    clean_parser.set_defaults(func=_cmd_clean)

    codes_parser = subparsers.add_parser('codes', help="étape 3 — un code par bénéficiaire")
    codes_parser.add_argument('--input', help="défaut : $DB_FC_EXPORT_2026")
    codes_parser.add_argument('--output', help="défaut : <entrée>/AAAA-MM-JJ-fc-with-codes.csv")
    codes_parser.add_argument('--existing-codes', help="défaut : $EXISTING_CODES_PATHFILE_2026")
    codes_parser.set_defaults(func=_cmd_codes)

    writeback_parser = subparsers.add_parser(
        'writeback', help="étape 4a — CSV de prod + couples pour writeback_verdict.sql")
    writeback_parser.add_argument('--with-codes', help="défaut : $FC_WITH_CODES_PATHFILE_2026")
    writeback_parser.add_argument(
        '--writeback-out', help=f"défaut : {WRITEBACK_FILENAME} dans ce dossier (nom figé)")
    writeback_parser.add_argument('--prod-out', help="défaut : <fichier daté>-fc-prod.csv")
    writeback_parser.set_defaults(func=_cmd_writeback)

    args = parser.parse_args(argv)
    print_stats(args.func(args))

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
