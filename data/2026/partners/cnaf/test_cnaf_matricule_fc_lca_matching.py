"""Unit tests for cnaf_matricule_fc_lca_matching.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnaf/test_cnaf_matricule_fc_lca_matching.py
"""

import pandas as pd
import pytest

import clean_cnaf_lib as cnaf
import cnaf_matricule_fc_lca_matching as poc


def _lca(**overrides):
    row = {
        'beneficiaire_id': '1', 'situation': 'jeune', 'genre': 'F',
        'nom': 'VORATEL', 'prenom': 'MIZALE TORINE', 'date_naissance': '2014-03-09',
        'allocataire_qualite': 'Mme', 'allocataire_nom': 'KORANDE',
        'allocataire_prenom': 'SOLIVE BERANE', 'allocataire_date_naissance': '1984-07-21',
        'allocataire_code_insee_naissance': '', 'allocataire_courriel': '',
    }
    return row | overrides


def _cnaf(**overrides):
    row = {
        'allocataire-matricule': '7000001', 'allocataire-code_organisme': '143',
        'allocataire-qualite': 'Mme', 'allocataire-nom': 'KORANDE',
        'allocataire-nom_naissance': 'KORANDE', 'allocataire-prenom': 'SOLIVE',
        'allocataire-date_naissance': '', 'allocataire-code_insee_naissance': '',
        'allocataire-courriel': '', 'nom': 'VORATEL', 'prenom': 'MIZALE',
        'date_naissance': '2014-03-09', 'genre': 'F', 'situation_origine': 'ARS',
        'fichier_cnaf': 'ars',
    }
    return row | overrides


def _run(lca_rows, cnaf_rows, avec_courriel=False):
    result, _ = poc.run(pd.DataFrame(lca_rows), pd.DataFrame(cnaf_rows), avec_courriel)
    return result.set_index('beneficiaire_id')


def test_match_through_respdos_scores_the_five_fields_plus_genre_and_qualite():
    result = _run([_lca()], [_cnaf(**{'allocataire-nom_naissance': 'PELUVAN'})])

    assert result.loc['1', 'verdict'] == 'unique'
    assert result.loc['1', 'matricule'] == '7000001'
    assert result.loc['1', 'code_organisme'] == '143'
    assert result.loc['1', 'score'] == 55
    assert result.loc['1', 'criteres_concordants'] == 'genre|qualite'


def test_match_through_nomnaidos_only():
    result, summary = poc.run(
        pd.DataFrame([_lca(allocataire_nom='PELUVAN')]),
        pd.DataFrame([_cnaf(**{'allocataire-nom_naissance': 'PELUVAN'})]))

    assert result.loc[0, 'verdict'] == 'unique'
    assert summary['via_nom_naissance_seul'] == 1


@pytest.mark.parametrize('lca, cnaf_prenom, expected', [
    ('LORAVIN MEZU TALIA', 'MEZU', True),
    ('JEAN PIERRE TALIA', 'JEAN-PIERRE', True),
    ('JEAN PIERRE TALIA', 'JEAN-MARC', False),
    ('LORAVIN', '', False),
    ('Élodie-Mézu', 'MEZU', True),
])
def test_prenoms_inclus(lca, cnaf_prenom, expected):
    result = poc.prenoms_inclus(pd.Series([cnaf_prenom]), pd.Series([lca]))

    assert result.tolist() == [expected]


def test_five_fields_only_score_50():
    result = _run([_lca(genre='', allocataire_qualite='')], [_cnaf()])

    assert result.loc['1', 'score'] == 50
    assert result.loc['1', 'criteres_concordants'] == ''


def test_allocataire_birthdate_confirms_with_25_points():
    result = _run([_lca()], [_cnaf(**{'allocataire-date_naissance': '1984-07-21'})])

    assert result.loc['1', 'score'] == 80
    assert result.loc['1', 'criteres_concordants'] == 'date_naissance_allocataire|genre|qualite'


def test_homonym_rejected_on_allocataire_birthdate():
    result = _run([_lca()], [_cnaf(**{'allocataire-date_naissance': '1979-01-02'})])

    assert result.loc['1', 'verdict'] == 'aucun'
    assert result.loc['1', 'paires_rejetees'] == 1


def test_homonym_rejected_on_qualite():
    result = _run([_lca()], [_cnaf(**{'allocataire-qualite': 'M'})])

    assert result.loc['1', 'verdict'] == 'aucun'
    assert result.loc['1', 'paires_rejetees'] == 1


def test_criterion_empty_on_one_side_neither_rewards_nor_rejects():
    result = _run([_lca(allocataire_date_naissance='')],
                  [_cnaf(**{'allocataire-date_naissance': '1979-01-02'})])

    assert result.loc['1', 'verdict'] == 'unique'
    assert result.loc['1', 'score'] == 55


def test_courriel_only_counts_with_the_option():
    lca = [_lca(allocataire_courriel=' Solive.Korande@exemple.test ')]
    cnaf_rows = [_cnaf(**{'allocataire-courriel': 'solive.korande@exemple.test'})]

    assert _run(lca, cnaf_rows, avec_courriel=True).loc['1', 'score'] == 70
    assert _run(lca, cnaf_rows, avec_courriel=False).loc['1', 'score'] == 55


def test_different_courriel_does_not_reject():
    result = _run([_lca(allocataire_courriel='a@exemple.test')],
                  [_cnaf(**{'allocataire-courriel': 'b@exemple.test'})], avec_courriel=True)

    assert result.loc['1', 'verdict'] == 'unique'
    assert result.loc['1', 'score'] == 55


def test_two_matricules_are_ambiguous():
    result = _run([_lca()], [_cnaf(), _cnaf(**{'allocataire-matricule': '7000002'})])

    assert result.loc['1', 'verdict'] == 'ambigu'
    assert result.loc['1', 'nb_matricules'] == 2
    assert pd.isna(result.loc['1', 'matricule'])
    assert result.loc['1', 'score'] == 55


def test_same_matricule_in_both_files_stays_unique():
    result = _run([_lca()], [_cnaf(), _cnaf(fichier_cnaf='aeeh_10_06')])

    assert result.loc['1', 'verdict'] == 'unique'
    assert result.loc['1', 'fichier_cnaf'] == 'aeeh_10_06|ars'


def test_aah_beneficiary_is_the_allocataire():
    # CNAF repeats the allocataire in the child columns, under the usage name
    lca = _lca(situation='AAH', nom='PELUVAN', prenom='SOLIVE BERANE', date_naissance='1984-07-21',
               allocataire_nom='PELUVAN', genre='F')
    cnaf_row = _cnaf(**{'allocataire-nom': 'KORANDE', 'allocataire-nom_naissance': 'PELUVAN',
                        'nom': 'KORANDE', 'prenom': 'SOLIVE', 'date_naissance': '1984-07-21',
                        'situation_origine': 'AAH'})

    result = _run([lca], [cnaf_row])

    assert result.loc['1', 'verdict'] == 'unique'


def test_other_parent_responsible_gives_no_match_but_counts_child_only():
    result = _run([_lca()], [_cnaf(**{'allocataire-nom': 'DABURO', 'allocataire-nom_naissance': 'DABURO',
                                      'allocataire-prenom': 'FENOLI', 'allocataire-qualite': 'M'})])

    assert result.loc['1', 'verdict'] == 'aucun'
    assert result.loc['1', 'enfant_seul_matricules'] == 1


def test_accents_and_hyphens_are_normalised():
    result = _run([_lca(nom="D'ÉLORANE-VUSI", allocataire_nom='KÖRANDE')],
                  [_cnaf(nom='DELORANE VUSI')])

    assert result.loc['1', 'verdict'] == 'unique'


def test_load_lca_reads_tsv(tmp_path):
    path = tmp_path / 'lca.tsv'
    pd.DataFrame([_lca(prenom='MIZALE TORINE', allocataire_courriel='')]).to_csv(path, sep='\t', index=False)

    df = poc.load_lca(str(path), avec_courriel=True)

    assert df.loc[0, 'prenom'] == 'MIZALE TORINE'
    assert df.loc[0, 'allocataire_courriel'] == ''


def test_load_lca_courriel_column_required_only_with_the_option(tmp_path):
    path = tmp_path / 'lca.tsv'
    row = {k: v for k, v in _lca().items() if k != 'allocataire_courriel'}
    pd.DataFrame([row]).to_csv(path, sep='\t', index=False)

    assert 'allocataire_courriel' not in poc.load_lca(str(path)).columns
    with pytest.raises(ValueError):
        poc.load_lca(str(path), avec_courriel=True)


def test_load_cnaf_ars_reads_the_raw_export(tmp_path):
    values = {column: '' for column in cnaf.CNAF_RAW_COLUMNS} | {
        'CODORG': '143', 'MATRICULE': '7000001', 'QUALDOS': 'MME', 'RESPDOS': 'KORANDE',
        'NOMNAIDOS': 'PELUVAN', 'PRENOMDOS': 'SOLIVE   ', 'DTNAIDOS': '21/07/1984',
        'ADRLIG5DESTDOS': '14400 BAYEUX', 'NOMENF': 'VORATEL', 'PRENOMENF': 'MIZALE',
        'DTNAIENF': '09/03/2014', 'SEXENF': 'F', 'ORIGINESELECTION': 'ARS'}
    path = tmp_path / 'cnaf.csv'
    path.write_text(
        "PASSPORT;143;20260906;160036;;;;;;;;;;;;;;;;;;;;;\r\n"
        + ';'.join(cnaf.CNAF_RAW_COLUMNS) + "\r\n"
        + ';'.join(values[c] for c in cnaf.CNAF_RAW_COLUMNS) + "\r\n"
        + "garbage\r\n",
        newline='')

    df = poc.load_cnaf_ars(str(path))

    assert len(df) == 1
    assert df.iloc[0]['allocataire-qualite'] == 'Mme'
    assert df.iloc[0]['allocataire-prenom'] == 'SOLIVE'
    assert df.iloc[0]['allocataire-date_naissance'] == '1984-07-21'
    assert df.iloc[0]['date_naissance'] == '2014-03-09'
    assert df.iloc[0]['fichier_cnaf'] == 'ars'


def test_load_cnaf_aeeh_reads_the_raw_export(tmp_path):
    values = {column: '' for column in cnaf.CNAF_RAW_COLUMNS_10_06_2026} | {
        'numorg': '143', 'matricul': '7000001', 'nomenf': 'VORATEL', 'prenomen': 'MIZALE',
        'dtnaienf': '09/03/2014', 'sexeenf': 'F', 'QUALDOS': 'MR', 'RESPDOS': 'KORANDE',
        'PRENOMDOS': 'SOLIVE', 'ADRLIG5DESTDOS': '14400 BAYEUX', 'EMAIL': 'x@exemple.test',
        'DRT': 'AEEH'}
    path = tmp_path / 'cnaf_aeeh.csv'
    path.write_text(
        ';'.join(cnaf.CNAF_RAW_COLUMNS_10_06_2026) + "\r\n"
        + ';'.join(values[c] for c in cnaf.CNAF_RAW_COLUMNS_10_06_2026) + "\r\n",
        newline='')

    df = poc.load_cnaf_aeeh(str(path))

    assert len(df) == 1
    assert df.iloc[0]['allocataire-qualite'] == 'M'
    assert df.iloc[0]['allocataire-courriel'] == 'x@exemple.test'
    assert df.iloc[0]['fichier_cnaf'] == 'aeeh_10_06'
