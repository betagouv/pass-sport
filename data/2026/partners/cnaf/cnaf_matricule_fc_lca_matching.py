"""POC: recover CAF matricules for LCA beneficiaries without one, from the two CNAF exports.

Input is the TSV of LCA beneficiaries (exercice 5, CAF, no matricule, enrolled in a
federation). It is matched against the raw CNAF exports read by
clean_cnaf_1_before_qf_batch.ipynb (CNAF_PATHFILE_2026) and 10_06_2026_clean_cnaf_aeeh.ipynb
(CNAF_PATHFILE_10_06_2026).

A pair (LCA row, CNAF row) is kept when the five identity fields agree: beneficiary
birthdate, nom and prenom, allocataire nom and prenom. Anti-homonym criteria then reject it
or add to its score (see SCORE_POINTS). A beneficiary gets a matricule only when the kept
pairs reach exactly one matricule.

Run from data/:
    source .venv/bin/activate && python 2026/partners/cnaf/cnaf_matricule_fc_lca_matching.py \
        lca_inscrits_sans_matricule.tsv resultat.csv [--avec-courriel]
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd

_HERE = Path(__file__).resolve().parent
for _path in (_HERE.parents[2], _HERE.parent, _HERE):
    if str(_path) not in sys.path:
        sys.path.append(str(_path))

import clean_cnaf_lib as cnaf  # noqa: E402
import partners_lib as partners  # noqa: E402
from utils.data_utils import pad_insee_or_postal_codes, require_columns  # noqa: E402

LCA_COLUMNS = [
    'beneficiaire_id', 'situation', 'genre', 'nom', 'prenom', 'date_naissance',
    'allocataire_qualite', 'allocataire_nom', 'allocataire_prenom',
    'allocataire_date_naissance', 'allocataire_code_insee_naissance',
]
LCA_COURRIEL_COLUMN = 'allocataire_courriel'

CNAF_COLUMNS = [
    'allocataire-matricule', 'allocataire-code_organisme', 'allocataire-qualite',
    'allocataire-nom', 'allocataire-nom_naissance', 'allocataire-prenom',
    'allocataire-date_naissance', 'allocataire-code_insee_naissance', 'allocataire-courriel',
    'nom', 'prenom', 'date_naissance', 'genre', 'situation_origine',
]

BASE_SCORE = 50

# criterion -> (LCA column, CNAF column, points when equal, rejects the pair when different)
CRITERIA = {
    'date_naissance_allocataire': ('allocataire_date_naissance', 'allocataire-date_naissance', 25, True),
    'courriel': (LCA_COURRIEL_COLUMN, 'allocataire-courriel', 15, False),
    'commune_naissance_allocataire': ('allocataire_code_insee_naissance', 'allocataire-code_insee_naissance', 5, False),
    'genre': ('genre', 'genre', 3, True),
    'qualite': ('allocataire_qualite', 'allocataire-qualite', 2, True),
}
SCORE_POINTS = {name: points for name, (_, _, points, _) in CRITERIA.items()}

SCORE_BANDS = pd.IntervalIndex.from_tuples([(50, 54), (55, 74), (75, 100)], closed='both')
SCORE_BAND_LABELS = ['50-54', '55-74', '>=75']

OUTPUT_COLUMNS = [
    'beneficiaire_id', 'situation', 'verdict', 'score', 'matricule', 'code_organisme',
    'fichier_cnaf', 'criteres_concordants', 'nb_matricules', 'paires_rejetees',
    'enfant_seul_matricules',
]


# --- Loading ----------------------------------------------------------------------

def _to_iso_date(values: pd.Series) -> pd.Series:
    """CNAF 'JJ/MM/AAAA' -> 'AAAA-MM-JJ', unparsable or empty -> ''."""
    return pd.to_datetime(values, format='%d/%m/%Y', errors='coerce').dt.strftime('%Y-%m-%d').fillna('')


def _shape_cnaf(df: pd.DataFrame, fichier: str) -> pd.DataFrame:
    df = partners.normalize_allocataire_qualite(df)[CNAF_COLUMNS].copy()
    df = df.fillna('')
    df['date_naissance'] = _to_iso_date(df['date_naissance'])
    df['allocataire-date_naissance'] = _to_iso_date(df['allocataire-date_naissance'])
    df['fichier_cnaf'] = fichier
    return df[df['allocataire-matricule'] != '']


def load_cnaf_ars(path: str) -> pd.DataFrame:
    """The ARS/AAH/AEEH export, read as clean_cnaf_1_before_qf_batch.ipynb does."""
    df = cnaf.clean_raw_cnaf(cnaf.read_raw_cnaf_csv(path))
    return _shape_cnaf(cnaf.map_cnaf_columns(df), 'ars')


def load_cnaf_aeeh(path: str) -> pd.DataFrame:
    """The 2026-10-06 AEEH export, read as 10_06_2026_clean_cnaf_aeeh.ipynb does."""
    df = cnaf.read_raw_cnaf_csv(path, columns=cnaf.CNAF_RAW_COLUMNS_10_06_2026, skiprows=1)
    df = partners.strip_all_string_columns(df)
    return _shape_cnaf(cnaf.map_cnaf_columns(df, cnaf.CNAF_COLUMN_MAPPING_10_06_2026), 'aeeh_10_06')


def load_lca(path: str, avec_courriel: bool = False) -> pd.DataFrame:
    """The LCA TSV export. The courriel column is only required, and kept, with avec_courriel."""
    df = pd.read_csv(path, sep='\t', dtype=str, keep_default_na=False)
    columns = LCA_COLUMNS + ([LCA_COURRIEL_COLUMN] if avec_courriel else [])
    require_columns(columns, df)
    df = df[columns].copy()
    df['date_naissance'] = df['date_naissance'].str[:10]
    df['allocataire_date_naissance'] = df['allocataire_date_naissance'].str[:10]
    return df


# --- Matching ---------------------------------------------------------------------

def prenoms_inclus(cnaf_prenoms: pd.Series, lca_prenoms: pd.Series) -> pd.Series:
    """Every word of the CNAF prénom is among the LCA prénoms (order free, composed names whole)."""
    cnaf_words = partners.normalise_recherche(cnaf_prenoms).str.split()
    lca_words = partners.normalise_recherche(lca_prenoms).str.split()
    return pd.Series(
        [bool(c) and set(c) <= set(l) for c, l in zip(cnaf_words, lca_words)],
        index=cnaf_prenoms.index, dtype=bool)


def _beneficiary_name_keys(df_cnaf: pd.DataFrame) -> pd.DataFrame:
    """One row per possible beneficiary nom: NOMENF, plus RESPDOS and NOMNAIDOS on AAH rows,
    where the beneficiary is the allocataire."""
    df_cnaf = df_cnaf.reset_index(drop=True).rename_axis('cnaf_row').reset_index()
    aah = df_cnaf[df_cnaf['situation_origine'] == 'AAH']
    keyed = pd.concat([
        df_cnaf.assign(cle_nom=partners.normalise_recherche(df_cnaf['nom'])),
        aah.assign(cle_nom=partners.normalise_recherche(aah['allocataire-nom'])),
        aah.assign(cle_nom=partners.normalise_recherche(aah['allocataire-nom_naissance'])),
    ])
    keyed = keyed[(keyed['cle_nom'] != '') & (keyed['date_naissance'] != '')]
    return keyed.drop_duplicates(subset=['cnaf_row', 'cle_nom'])


def _comparable(column: str, values: pd.Series) -> pd.Series:
    values = values.fillna('').astype(str).str.strip()
    if column in ('allocataire_code_insee_naissance', 'allocataire-code_insee_naissance'):
        return pad_insee_or_postal_codes(values)
    return values.str.upper()


def match(df_lca: pd.DataFrame, df_cnaf: pd.DataFrame) -> pd.DataFrame:
    """Every (LCA, CNAF) pair sharing beneficiary birthdate and nom, with the other identity
    checks as boolean columns: enfant_ok (criteria 1-3), allocataire_ok (4-5)."""
    lca = df_lca.assign(cle_nom=partners.normalise_recherche(df_lca['nom']))
    pairs = lca.merge(
        _beneficiary_name_keys(df_cnaf), on=['date_naissance', 'cle_nom'],
        suffixes=('', '_cnaf')).drop_duplicates(subset=['beneficiaire_id', 'cnaf_row'])

    lca_allocataire_nom = partners.normalise_recherche(pairs['allocataire_nom'])
    via_usage = lca_allocataire_nom == partners.normalise_recherche(pairs['allocataire-nom'])
    via_naissance = lca_allocataire_nom == partners.normalise_recherche(pairs['allocataire-nom_naissance'])

    pairs['enfant_ok'] = prenoms_inclus(pairs['prenom_cnaf'], pairs['prenom'])
    pairs['allocataire_ok'] = (
        (lca_allocataire_nom != '') & (via_usage | via_naissance)
        & prenoms_inclus(pairs['allocataire-prenom'], pairs['allocataire_prenom']))
    pairs['via_nom_naissance_seul'] = via_naissance & ~via_usage
    return pairs.reset_index(drop=True)


def score_paires(pairs: pd.DataFrame, avec_courriel: bool = False) -> pd.DataFrame:
    """Evaluate the anti-homonym criteria on each pair: rejet, score, criteres_concordants.

    A criterion only counts when filled on both sides. For each one, `<name>_renseigne`
    and `<name>_concorde` are kept for the summary.
    """
    pairs = pairs.copy()
    pairs['rejet'] = False
    pairs['score'] = BASE_SCORE
    concordants = pd.Series([[] for _ in range(len(pairs))], index=pairs.index, dtype=object)

    for name, (lca_column, cnaf_column, points, rejects) in CRITERIA.items():
        if name == 'courriel' and not avec_courriel:
            continue
        # 'genre' exists on both sides: the merge suffixed the CNAF one
        cnaf_source = f'{cnaf_column}_cnaf' if cnaf_column == lca_column else cnaf_column
        lca_values = _comparable(lca_column, pairs[lca_column])
        cnaf_values = _comparable(cnaf_column, pairs[cnaf_source])
        renseigne = (lca_values != '') & (cnaf_values != '')
        concorde = renseigne & (lca_values == cnaf_values)

        pairs[f'{name}_renseigne'] = renseigne
        pairs[f'{name}_concorde'] = concorde
        if rejects:
            pairs['rejet'] |= renseigne & ~concorde
        pairs['score'] += concorde * points
        concordants = concordants.where(~concorde, concordants.map(lambda c, n=name: c + [n]))

    pairs['criteres_concordants'] = concordants.map('|'.join)
    return pairs


def verdicts(df_lca: pd.DataFrame, pairs: pd.DataFrame) -> pd.DataFrame:
    """One row per LCA beneficiary: unique / ambigu / aucun, with the best pair's score."""
    identity_ok = pairs['enfant_ok'] & pairs['allocataire_ok']
    kept = pairs[identity_ok & ~pairs['rejet']]

    nb_matricules = kept.groupby('beneficiaire_id')['allocataire-matricule'].nunique()
    fichiers = (kept.groupby(['beneficiaire_id', 'allocataire-matricule'])['fichier_cnaf']
                .agg(lambda f: '|'.join(sorted(set(f)))).rename('fichiers').reset_index())
    best = (kept.sort_values('score', ascending=False, kind='stable')
            .drop_duplicates('beneficiaire_id')
            .merge(fichiers, on=['beneficiaire_id', 'allocataire-matricule'])
            .set_index('beneficiaire_id'))

    result = df_lca[['beneficiaire_id', 'situation']].set_index('beneficiaire_id')
    result['nb_matricules'] = nb_matricules.reindex(result.index).fillna(0).astype(int)
    result['verdict'] = result['nb_matricules'].map(
        lambda n: 'aucun' if n == 0 else 'unique' if n == 1 else 'ambigu')
    result['score'] = best['score'].reindex(result.index).astype('Int64')

    is_unique = result['verdict'] == 'unique'
    for column, source in (('matricule', 'allocataire-matricule'),
                           ('code_organisme', 'allocataire-code_organisme'),
                           ('fichier_cnaf', 'fichiers'),
                           ('criteres_concordants', 'criteres_concordants'),
                           ('via_nom_naissance_seul', 'via_nom_naissance_seul')):
        result[column] = best[source].reindex(result.index).where(is_unique)

    result['paires_rejetees'] = (pairs[identity_ok & pairs['rejet']].groupby('beneficiaire_id').size()
                                 .reindex(result.index).fillna(0).astype(int))
    result['enfant_seul_matricules'] = (pairs[pairs['enfant_ok']]
                                        .groupby('beneficiaire_id')['allocataire-matricule'].nunique()
                                        .reindex(result.index).fillna(0).astype(int))
    return result.reset_index()


# --- Summary ----------------------------------------------------------------------

def score_band(scores: pd.Series) -> pd.Series:
    bands = pd.cut(scores.astype(float), SCORE_BANDS)
    return bands.cat.rename_categories(SCORE_BAND_LABELS).astype(str).replace('nan', '')


def summarize(result: pd.DataFrame, pairs: pd.DataFrame, avec_courriel: bool = False) -> dict:
    """Aggregates only, no personal data."""
    result = result.assign(tranche_score=score_band(result['score']))
    unique = result[result['verdict'] == 'unique']
    identity_ok = pairs[pairs['enfant_ok'] & pairs['allocataire_ok']]

    criteres = {}
    for name, (_, _, _, rejects) in CRITERIA.items():
        if f'{name}_renseigne' not in identity_ok:
            continue
        renseigne = identity_ok[f'{name}_renseigne']
        concorde = identity_ok[f'{name}_concorde']
        criteres[name] = {
            'renseignees': int(renseigne.sum()),
            'accords': int(concorde.sum()),
            'rejets': int((renseigne & ~concorde).sum()) if rejects else 0,
        }

    summary = {
        'verdicts': result.groupby(['situation', 'verdict', 'tranche_score'], dropna=False).size(),
        'via_nom_naissance_seul': int(unique['via_nom_naissance_seul'].eq(True).sum()),
        'criteres': pd.DataFrame(criteres).T,
    }
    if avec_courriel:
        thanks_to_courriel = (
            unique['criteres_concordants'].fillna('').str.split('|').map(lambda c: 'courriel' in c)
            & (unique['score'] >= 75)
            & (unique['score'] - SCORE_POINTS['courriel'] < 75))
        summary['passent_75_grace_au_courriel'] = int(thanks_to_courriel.sum())
    return summary


def run(df_lca: pd.DataFrame, df_cnaf: pd.DataFrame, avec_courriel: bool = False):
    pairs = score_paires(match(df_lca, df_cnaf), avec_courriel)
    result = verdicts(df_lca, pairs)
    return result, summarize(result, pairs, avec_courriel)


def main(argv=None) -> None:
    from dotenv import load_dotenv

    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('lca_tsv')
    parser.add_argument('output_csv')
    parser.add_argument('--avec-courriel', action='store_true',
                        help="compare the allocataire's courriel (adds to the score only)")
    args = parser.parse_args(argv)

    load_dotenv()
    df_cnaf = pd.concat([
        load_cnaf_ars(os.environ['CNAF_PATHFILE_2026']),
        load_cnaf_aeeh(os.environ['CNAF_PATHFILE_10_06_2026']),
    ], ignore_index=True)
    df_lca = load_lca(args.lca_tsv, args.avec_courriel)
    print(f"{len(df_lca)} LCA beneficiaries, {len(df_cnaf)} CNAF rows")

    result, summary = run(df_lca, df_cnaf, args.avec_courriel)
    result[OUTPUT_COLUMNS].to_csv(args.output_csv, index=False)

    print(f"\nResults written to {args.output_csv}\n")
    print(summary['verdicts'].to_string())
    print(f"\nunique matches found through NOMNAIDOS only: {summary['via_nom_naissance_seul']}")
    if args.avec_courriel:
        print(f"unique matches reaching >=75 thanks to the courriel: {summary['passent_75_grace_au_courriel']}")
    print("\nAnti-homonym criteria, on pairs passing the five identity fields:")
    print(summary['criteres'].to_string())


if __name__ == '__main__':
    main()
