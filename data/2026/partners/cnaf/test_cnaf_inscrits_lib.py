"""Unit tests for cnaf_inscrits_lib, the matching behind 25_11_2026_export_cnaf_inscrits.py.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnaf/test_cnaf_inscrits_lib.py
"""

import pandas as pd

import clean_cnaf_lib as cnaf
import cnaf_inscrits_lib as lib


def _first_file(*rows):
    """Raw rows of the first CNAF file, every column blank unless given."""
    return pd.DataFrame([{column: '' for column in cnaf.CNAF_RAW_COLUMNS} | row for row in rows],
                        columns=cnaf.CNAF_RAW_COLUMNS)


def _aeeh_file(*rows):
    """Raw rows of the 2026-10-06 AEEH file, every column blank unless given."""
    return pd.DataFrame(
        [{column: '' for column in cnaf.CNAF_RAW_COLUMNS_10_06_2026} | row for row in rows],
        columns=cnaf.CNAF_RAW_COLUMNS_10_06_2026)


def _child(codorg='143', matricule='9990001', nom='VORTAPIX', prenom='QUORVANE',
           dtnaienf='03/02/2012', origine='ARS', **overrides):
    return {
        'CODORG': codorg, 'MATRICULE': matricule, 'RESPDOS': 'VORTAPIX',
        'NOMNAIDOS': 'KLUMEDOR', 'PRENOMDOS': 'TRASPELINE', 'DTNAIDOS': '14/07/1984',
        'SEXDOS': 'F', 'NOMENF': nom, 'PRENOMENF': prenom, 'DTNAIENF': dtnaienf,
        'SEXENF': 'M', 'ORIGINESELECTION': origine,
    } | overrides


def _aeeh_child(numorg='143', matricul='9990001', nomenf='VORTAPIX', prenomen='QUORVANE',
                dtnaienf='03/02/2012'):
    return {
        'numorg': numorg, 'matricul': matricul, 'RESPDOS': 'VORTAPIX', 'NOMNAIDOS': 'KLUMEDOR',
        'PRENOMDOS': 'TRASPELINE', 'DTNAIDOS': '', 'SEXDOS': '', 'nomenf': nomenf,
        'prenomen': prenomen, 'dtnaienf': dtnaienf, 'sexeenf': 'M',
    }


def _inscrits(*rows):
    defaults = {
        'inscription_id': '1', 'beneficiaire_id': '1', 'id_etat': '1', 'id_psp': '26-ZZZZ-0001',
        'nom': 'VORTAPIX', 'prenom': 'QUORVANE', 'date_naissance': '2012-02-03',
        'organisme': 'CAF', 'situation': 'jeune', 'allocataire_matricule': '9990001',
    }
    return pd.DataFrame([defaults | row for row in rows])


def _export(df_first, df_aeeh, df_inscrits):
    df_raw = lib.build_raw_candidates(df_first, df_aeeh)
    df_matched, df_unmatched, several = lib.match_inscrits(
        lib.select_cnaf_inscrits(df_inscrits), df_raw)
    return lib.format_output(df_matched), df_unmatched, several


def test_align_aeeh_export_renames_to_first_file_columns():
    result = lib.align_aeeh_export(_aeeh_file(_aeeh_child()))

    assert list(result.columns) == lib.RAW_COLUMNS
    assert result.loc[0, 'CODORG'] == '143'
    assert result.loc[0, 'MATRICULE'] == '9990001'
    assert result.loc[0, 'NOMENF'] == 'VORTAPIX'
    assert result.loc[0, 'ORIGINESELECTION'] == 'AEEH'


def test_raw_identity_is_normalised_like_the_injected_one():
    df_first = _first_file(_child(nom=' Vortapix ', prenom='Zéphralune ', dtnaienf='03/02/2012'))
    df_inscrits = _inscrits({'prenom': 'ZEPHRALUNE'})

    df_output, df_unmatched, _ = _export(df_first, _aeeh_file(), df_inscrits)

    assert len(df_output) == 1
    assert df_unmatched.empty
    # the CNAF's own values are exported, not the normalised key
    assert df_output.loc[0, 'PRENOMENF'] == 'Zéphralune '
    assert df_output.loc[0, 'DTNAIENF'] == '03/02/2012'


def test_non_caf_inscrits_and_missing_matricules_are_left_out():
    df_first = _first_file(
        _child(),
        _child(matricule='', prenom='MIVALDOZ'),
    )
    df_inscrits = _inscrits(
        {'beneficiaire_id': '1', 'organisme': 'MSA'},
        {'beneficiaire_id': '2', 'prenom': 'MIVALDOZ', 'allocataire_matricule': ''},
    )

    assert lib.select_cnaf_inscrits(df_inscrits).empty
    assert len(lib.build_raw_candidates(df_first, _aeeh_file())) == 1


def test_sibling_without_inscription_is_not_exported():
    df_first = _first_file(_child(prenom='QUORVANE'), _child(prenom='MIVALDOZ'))

    df_output, _, _ = _export(df_first, _aeeh_file(), _inscrits({}))

    assert df_output['PRENOMENF'].tolist() == ['QUORVANE']


def test_child_in_both_files_keeps_the_row_of_its_situation():
    df_first = _first_file(_child(origine='ARS', SEXDOS='F'))
    df_aeeh = _aeeh_file(_aeeh_child())
    df_raw = lib.build_raw_candidates(df_first, df_aeeh)

    df_matched, _, several = lib.match_inscrits(_inscrits({'situation': 'AEEH'}), df_raw)

    assert several == 1
    assert df_matched['fichier'].tolist() == [2]
    assert lib.format_output(df_matched).loc[0, 'SEXDOS'] == ''


def test_first_file_wins_a_situation_tie():
    df_first = _first_file(_child(origine='AEEH', SEXDOS='F'))
    df_raw = lib.build_raw_candidates(df_first, _aeeh_file(_aeeh_child()))

    df_matched, _, _ = lib.match_inscrits(_inscrits({'situation': 'AEEH'}), df_raw)

    assert df_matched['fichier'].tolist() == [1]


def test_exact_raw_duplicates_give_one_row():
    df_first = _first_file(_child(), _child())

    df_output, _, several = _export(df_first, _aeeh_file(), _inscrits({}))

    assert len(df_output) == 1
    assert several == 0


def test_inscrit_not_found_is_returned_with_its_identifiers_only():
    df_inscrits = _inscrits({'beneficiaire_id': '7', 'inscription_id': '70', 'prenom': 'BRELINOX'})

    df_output, df_unmatched, _ = _export(_first_file(_child()), _aeeh_file(), df_inscrits)

    assert df_output.empty
    assert list(df_unmatched.columns) == lib.UNMATCHED_COLUMNS
    assert df_unmatched['beneficiaire_id'].tolist() == ['7']


def test_unparsable_child_birthdate_never_matches():
    df_raw = lib.build_raw_candidates(_first_file(_child(dtnaienf='')), _aeeh_file())

    assert df_raw.empty


def test_output_has_the_requested_columns_sorted_by_codorg_as_a_number():
    df_first = _first_file(
        _child(codorg='143', matricule='9990001'),
        _child(codorg='21', matricule='9990002', prenom='MIVALDOZ'),
        _child(codorg='7', matricule='9990003', prenom='BRELINOX', origine='AAH'),
    )
    df_inscrits = _inscrits(
        {'beneficiaire_id': '1'},
        {'beneficiaire_id': '2', 'prenom': 'MIVALDOZ', 'allocataire_matricule': '9990002'},
        {'beneficiaire_id': '3', 'prenom': 'BRELINOX', 'allocataire_matricule': '9990003',
         'situation': 'AAH'},
    )

    df_output, _, _ = _export(df_first, _aeeh_file(), df_inscrits)

    assert list(df_output.columns) == lib.OUTPUT_COLUMNS
    assert 'NOM_BENEF' in df_output.columns and 'NOMENF' not in df_output.columns
    assert df_output['CODORG'].tolist() == ['7', '21', '143']
