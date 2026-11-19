"""Unit tests for clean_spm_lib, the CPS-specific logic of 18_11_2026_clean_spm.py.

The shared pieces (eligibility windows, JSON serialization, lamp01 key) are tested in
../test_partners_lib.py. What is checked here is what the CPS file alone brings: its header,
its free-form phone numbers, its 8-digit foreign birthplaces and the situation rule.

All data are invented syllable by syllable rather than taken from any plausible French list
so no fixture can collide with a real beneficiary.

Run from data/: source .venv/bin/activate && pytest 2026/partners/spm/test_clean_spm_lib.py
"""

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

import clean_spm_lib as spm
import partners_lib as partners

SCHEMA = Path(__file__).resolve().parents[4] / 'lamp01' / 'db-init' / '00-schema.sql'


def raw_row(**values) -> dict:
    """One delivered row: a mother and her son, overridable column by column."""
    row = {
        'organisme': 'CPS',
        'date_naissance': '2013-04-03',
        'nom': 'ZYLMUMIR',
        'nom_naissance': '',
        'prenom': 'HYXIONIX',
        'genre': 'M',
        'allocataire-qualite': 'Mme',
        'allocataire-nom': 'ZYLMUMIR',
        'allocataire-prenom': 'BALION',
        'allocataire-telephone': '06 39 98 46 00',
        'allocataire-courriel': 'fyrith.valbe@example.org',
        'allocataire-commune_naissance': '97502',
        'allocataire-code_iso_pays_naissance': 'PM',
        'adresse-allocataire_voie': '111',
        'adresse-allocataire_nom_adresse_postal': 'RUE TARNOX',
        'adresse-allocataire_code_postal': '97500',
        'adresse-allocataire_commune': 'Castrevel',
        'adresse-allocataire_code_insee': '97502',
        'adresse-allocataire_cptl_adresse': '',
        'quotient-familial': '',
    }
    return row | values


def write_csv(tmp_path, rows, header=None) -> Path:
    """The CPS shape: comma-separated, every field quoted."""
    header = header or spm.SPM_2026_HEADER
    path = tmp_path / 'cps.csv'
    lines = [','.join(f'"{column}"' for column in header)]
    lines += [','.join(f'"{row[column]}"' for column in header) for row in rows]
    path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return path


def mapped(*rows) -> pd.DataFrame:
    """Rows as the script holds them right before the cleaning steps."""
    df = pd.DataFrame(list(rows) or [raw_row()], dtype=str)
    return spm.blank_to_nan(partners.strip_all_string_columns(spm.map_spm_columns(df)))


def routed(*rows) -> pd.DataFrame:
    """Rows up to assign_situation, as the script runs them."""
    df, _ = spm.apply_nom_naissance(mapped(*rows))
    df = partners.normalize_identity_casing(df)
    df = partners.parse_beneficiary_birthdate(df, date_format='%Y-%m-%d')
    return spm.assign_situation(spm.parse_qf(df))


# --- reading and mapping --------------------------------------------------------------

def test_reads_the_quoted_comma_separated_file(tmp_path):
    df = spm.read_raw_spm_csv(write_csv(tmp_path, [raw_row(), raw_row(prenom='QUOITH')]))
    assert list(df.columns) == spm.SPM_2026_HEADER
    assert df['prenom'].tolist() == ['HYXIONIX', 'QUOITH']
    assert df.loc[0, 'nom_naissance'] == ''


def test_refuses_another_header_naming_the_difference(tmp_path):
    header = [column for column in spm.SPM_2026_HEADER if column != 'quotient-familial'] + ['qf']
    rows = [raw_row() | {'qf': ''}]
    with pytest.raises(ValueError, match=r"missing: \['quotient-familial'\], unexpected: \['qf'\]"):
        spm.read_raw_spm_csv(write_csv(tmp_path, rows, header))


def test_files_cps_rows_as_msa_459_without_matricule():
    df = mapped()
    assert df.loc[0, 'organisme'] == 'MSA'
    assert df.loc[0, 'allocataire-code_organisme'] == '459'
    assert pd.isna(df.loc[0, 'allocataire-matricule'])
    assert df.loc[0, 'allocataire-code_insee_commune_naissance'] == '97502'
    assert pd.isna(df.loc[0, 'adresse_allocataire-cplt_adresse'])


def test_refuses_another_organisme():
    with pytest.raises(ValueError, match=r"line\(s\) \[3\]: \['CAF'\]"):
        spm.map_spm_columns(pd.DataFrame([raw_row(), raw_row(organisme='CAF')], dtype=str))


def test_sets_aside_rows_missing_a_required_value():
    df_ok, df_missing = spm.split_missing_required(mapped(raw_row(), raw_row(prenom='')))
    assert len(df_ok) == 1
    assert df_missing['motif'].tolist() == ['champ_obligatoire_vide']


# --- cleaning -------------------------------------------------------------------------

def test_birth_name_wins_when_given():
    df, changed = spm.apply_nom_naissance(mapped(
        raw_row(),
        raw_row(nom='ZYLRAXWEN', nom_naissance='VEXKEANT'),
        raw_row(nom='Ivorraxzik', nom_naissance='IVORRAXZIK'),
    ))
    assert df['nom'].tolist() == ['ZYLMUMIR', 'VEXKEANT', 'IVORRAXZIK']
    assert df['nom_usage'].tolist() == ['ZYLMUMIR', 'ZYLRAXWEN', 'Ivorraxzik']
    # only a different name counts, not a different casing
    assert changed == 1


def test_genre_must_be_m_or_f():
    spm.check_genre(pd.DataFrame({'genre': ['M', 'F']}))
    with pytest.raises(ValueError, match=r"line\(s\) \[3\]"):
        spm.check_genre(pd.DataFrame({'genre': ['M', 'X']}))


@pytest.mark.parametrize('delivered, kept', [
    ('06 39 98 26 35', '0639982635'),
    ('06-39-98-79-94', '0639987994'),
    ('06.39.98.91.83', '0639989183'),
    ('06 39 98 81 09 / 06 39 98 22 09', '0639988109'),
    ('06.39.98.02.15 / 06.39.98.25.61', '0639980215'),
    ('51 54 58 - 41 22 33', '515458'),
    ('51 54 58', '515458'),
    ('07 00 00 00 00', np.nan),
    ('', np.nan),
])
def test_phone_keeps_the_first_number_digits_only(delivered, kept):
    df, _ = spm.normalize_phone(mapped(raw_row(**{'allocataire-telephone': delivered})))
    value = df.loc[0, 'allocataire-telephone']
    assert (pd.isna(value) and pd.isna(kept)) or value == kept


def test_phone_counts_the_fields_holding_two_numbers():
    _, two_numbers = spm.normalize_phone(mapped(
        raw_row(**{'allocataire-telephone': '06 39 98 81 09 / 06 39 98 22 09'}),
        raw_row(**{'allocataire-telephone': '06-39-98-79-94'}),
    ))
    assert two_numbers == 1


@pytest.mark.parametrize('numero, rue, voie', [
    ('60', 'RUE PÉNOVRE', '60 RUE PÉNOVRE'),
    ('', 'RUE DU BOIS-KELLAR', 'RUE DU BOIS-KELLAR'),
    ('131', '', '131'),
    ('', '', np.nan),
])
def test_voie_joins_number_and_street(numero, rue, voie):
    df = spm.build_voie(mapped(raw_row(**{
        'adresse-allocataire_voie': numero, 'adresse-allocataire_nom_adresse_postal': rue})))
    value = df.loc[0, 'adresse_allocataire-voie']
    assert (pd.isna(value) and pd.isna(voie)) or value == voie


def test_birthplace_padded_kept_for_french_territories_cleared_abroad():
    df, padded, cleared = spm.clean_birthplace(mapped(
        raw_row(),
        raw_row(**{'allocataire-commune_naissance': '9225', 'allocataire-code_iso_pays_naissance': 'FR'}),
        raw_row(**{'allocataire-commune_naissance': '97410', 'allocataire-code_iso_pays_naissance': 'RE'}),
        raw_row(**{'allocataire-commune_naissance': '75056', 'allocataire-code_iso_pays_naissance': 'FR'}),
        raw_row(**{'allocataire-commune_naissance': '99155003', 'allocataire-code_iso_pays_naissance': 'UA'}),
        raw_row(**{'allocataire-commune_naissance': '', 'allocataire-code_iso_pays_naissance': 'FR'}),
    ))
    codes = df['allocataire-code_insee_commune_naissance'].tolist()
    assert codes[:4] == ['97502', '09225', '97410', '75056']
    assert pd.isna(codes[4]) and pd.isna(codes[5])
    assert df.loc[4, 'allocataire-code_iso_pays_naissance'] == 'UA'
    assert (padded, cleared) == (1, 1)


def test_birthplace_that_is_no_commune_code_raises():
    with pytest.raises(ValueError, match=r"line\(s\) \[2\]: \['975020'\]"):
        spm.clean_birthplace(mapped(raw_row(**{'allocataire-commune_naissance': '975020'})))


def test_qf_parsed_empty_stays_empty_unreadable_raises():
    df = spm.parse_qf(mapped(raw_row(**{'quotient-familial': '375'}), raw_row()))
    assert df.loc[0, 'qf_value'] == 375
    assert pd.isna(df.loc[1, 'qf_value'])

    with pytest.raises(ValueError, match=r"line\(s\) \[2\]: \['3 75'\]"):
        spm.parse_qf(mapped(raw_row(**{'quotient-familial': '3 75'})))


# --- situation and eligibility --------------------------------------------------------

def test_situation_aah_then_qf_then_aeeh():
    df = routed(
        # the beneficiary is the allocataire
        raw_row(date_naissance='2001-12-14', prenom='HYXVEL', **{'allocataire-prenom': 'HYXVEL'}),
        # same, even with a QF: AAH comes first
        raw_row(date_naissance='2001-12-14', prenom='HYXVEL', **{
            'allocataire-prenom': 'HYXVEL', 'quotient-familial': '210'}),
        # same person under the birth name, the allocataire under the delivered one
        raw_row(date_naissance='2002-03-27', nom='FENLOVDEL', nom_naissance='WYNKAR', prenom='Wynovaith',
                **{'allocataire-nom': 'FENLOVDEL', 'allocataire-prenom': 'WYNOVAITH'}),
        # a child, with a QF
        raw_row(**{'quotient-familial': '375'}),
        # a child, without one
        raw_row(),
        # same nom, different prénom: still a child
        raw_row(prenom='ILKUNE', **{'allocataire-prenom': 'GALYAN-YORIRA'}),
    )
    assert df['situation'].tolist() == ['AAH', 'AAH', 'AAH', 'jeune', 'AEEH', 'AEEH']


@pytest.mark.parametrize('date_naissance, qf, motif', [
    ('2009-01-01', '699', None),
    ('2020-12-31', '0', None),
    ('2013-04-03', '700', 'qf_trop_eleve'),
    ('2013-04-03', '899', 'qf_trop_eleve'),
    ('2008-12-31', '375', 'hors_fenetre_qf'),
])
def test_qf_route_window_and_threshold(date_naissance, qf, motif):
    eligible, rejected = spm.select_eligible(routed(
        raw_row(date_naissance=date_naissance, **{'quotient-familial': qf})))
    assert rejected['motif'].tolist() == ([] if motif is None else [motif])
    assert len(eligible) == (1 if motif is None else 0)


@pytest.mark.parametrize('date_naissance, motif', [
    ('2007-01-01', None),
    ('2020-12-31', None),
    ('2006-12-31', 'hors_fenetre_aeeh'),
])
def test_aeeh_window(date_naissance, motif):
    _, rejected = spm.select_eligible(routed(raw_row(date_naissance=date_naissance)))
    assert rejected['motif'].tolist() == ([] if motif is None else [motif])


@pytest.mark.parametrize('date_naissance, motif', [
    ('1996-01-01', None),
    ('2010-12-31', None),
    ('1995-12-31', 'hors_fenetre_aah'),
])
def test_aah_window(date_naissance, motif):
    _, rejected = spm.select_eligible(routed(raw_row(
        date_naissance=date_naissance, prenom='HYXVEL', **{'allocataire-prenom': 'HYXVEL'})))
    assert rejected['motif'].tolist() == ([] if motif is None else [motif])


# --- output ---------------------------------------------------------------------------

def serialized(*rows) -> pd.DataFrame:
    df = routed(*rows)
    df, _ = spm.normalize_phone(df)
    df = spm.build_voie(df)
    df, _, _ = spm.clean_birthplace(df)
    df = partners.add_allocataire_json_column(df, extra_fields=spm.ALLOCATAIRE_JSON_EXTRA_FIELDS)
    return partners.add_adresse_allocataire_json_column(df)


def lamp01_columns() -> set:
    return set(re.findall(r'^\s*((?:adresse_)?allocataire_\w+) ', SCHEMA.read_text(), re.MULTILINE))


def test_every_json_key_has_a_lamp01_column():
    df = serialized(raw_row(**{'adresse-allocataire_cptl_adresse': 'APP 2'}))
    allocataire = json.loads(df.loc[0, 'allocataire'])
    adresse = json.loads(df.loc[0, 'adresse_allocataire'])

    assert allocataire == {
        'qualite': 'Mme', 'code_organisme': '459', 'telephone': '0639984600', 'nom': 'ZYLMUMIR',
        'prenom': 'BALION', 'courriel': 'fyrith.valbe@example.org',
        'code_insee_commune_naissance': '97502', 'code_iso_pays_naissance': 'PM',
    }
    assert adresse == {
        'voie': '111 RUE TARNOX', 'code_postal': '97500', 'commune': 'Castrevel',
        'code_insee': '97502', 'cplt_adresse': 'APP 2',
    }
    flattened = {f'allocataire_{key}' for key in allocataire} | {f'adresse_allocataire_{key}' for key in adresse}
    assert flattened <= lamp01_columns()


def test_split_already_in_lamp_carries_the_existing_code():
    df = serialized(raw_row(), raw_row(prenom='QUOITH'))
    df_lamp = pd.DataFrame([{
        'id_psp': '26-ABCD-EFGH', 'nom': 'ZYLMUMIR', 'prenom': 'HYXIONIX',
        'date_naissance': '2013-04-03 04:00:00', 'genre': 'M', 'organisme': 'MSA',
        'allocataire_nom': 'ZYLMUMIR', 'allocataire_prenom': 'BALION',
    }])
    df_new, df_known = spm.split_already_in_lamp(df, df_lamp)
    assert df_new['prenom'].tolist() == ['QUOITH']
    assert df_known['id_psp_existant'].tolist() == ['26-ABCD-EFGH']


def test_split_already_in_lamp_with_an_empty_lamp():
    df = serialized(raw_row())
    df_new, df_known = spm.split_already_in_lamp(df, pd.DataFrame(columns=['id_psp', 'nom']))
    assert len(df_new) == 1 and df_known.empty


def test_email_rows_per_kind():
    df = serialized(
        raw_row(date_naissance='2001-12-14', prenom='HYXVEL', **{'allocataire-prenom': 'HYXVEL'}),
        raw_row(),
        raw_row(**{'allocataire-courriel': ''}),
    ).assign(id_psp=['26-AAAA-AAAA', '26-BBBB-BBBB', '26-CCCC-CCCC'])
    df = partners.shift_birthdate_by_hours(df)

    emails, without_email = spm.build_email_rows(df)
    assert list(emails.columns) == spm.EMAIL_COLUMNS
    assert emails[['id', 'kind', 'email', 'date_naissance', 'allocataire_prenom']].values.tolist() == [
        ['26-AAAA-AAAA', 'code_direct_aah', 'fyrith.valbe@example.org', '2001-12-14', 'HYXVEL'],
        ['26-BBBB-BBBB', 'code_indirect', 'fyrith.valbe@example.org', '2013-04-03', 'BALION'],
    ]
    assert without_email == 1
