"""Unit tests for clean_cnous_lib, the CNOUS-specific logic of clean_cnous.ipynb.

Everything the CNOUS shares with the CNAF and the MSA is tested one folder up, in
../test_partners_lib.py; the code drawing and its bookkeeping in ../test_generate_codes_lib.py
and ../../utils/test_codes_utils.py. What is checked here is what the CNOUS file alone
brings: its 19 positional columns, its two date formats, its ISO
birth-country code and the leading zeros its export drops.

All data are invented syllable by syllable rather than taken from any
plausible French list so no fixture can collide
with a real beneficiary.

Run from data/: source .venv/bin/activate && pytest 2026/partners/cnous/test_clean_cnous_lib.py
"""

import json
from datetime import datetime

import numpy as np
import pandas as pd
import pytest

import clean_cnous_lib as lib
import partners_lib as partners


def raw_row(**values) -> pd.DataFrame:
    """A one-row frame carrying all 20 delivered columns, blank but for the ones given.

    map_cnous_columns checks the header it is handed, so the fixtures it takes have to be
    complete even when the assertion only looks at two columns.
    """
    row = {column: [''] for column in lib.CNOUS_RAW_COLUMNS}
    return pd.DataFrame({**row, **{column: [value] for column, value in values.items()}})


def mapped_frame(**columns) -> pd.DataFrame:
    """A frame already renamed to the PSP schema, for the steps running after the mapping."""
    return pd.DataFrame(columns)


# --- Reading the file -------------------------------------------------------------

CNOUS_HEADER_LINE = ';'.join(lib.CNOUS_RAW_COLUMNS)

CNOUS_ROW = (
    "2003-05-14;VORNIDEL;Kalisse;F;Mme;999990001ZZ;VORNIDEL;Kalisse;"
    "kalisse.vornidel@example.org;14/05/2003;54395;morbelac;FR;7 RUE DES BRAVELINES;"
    "54600;Vardele-les-Morbin;54578;;")


@pytest.mark.parametrize('row', [CNOUS_ROW, f"{CNOUS_ROW};0Bis"], ids=['19 fields', 'echelon'])
def test_read_raw_cnous_csv_loads_the_19_columns_only(tmp_path, row):
    """With or without the trailing échelon, the 19 columns and nothing shifted."""
    filepath = tmp_path / 'cnous.csv'
    filepath.write_text(f"{CNOUS_HEADER_LINE}\n{row}\n", encoding='utf-8')

    df = lib.read_raw_cnous_csv(filepath)

    assert list(df.columns) == lib.CNOUS_RAW_COLUMNS
    assert df.index.tolist() == [0]
    assert df.loc[0, 'date_naissance'] == '2003-05-14'
    assert df.loc[0, 'allocataire-matricule'] == '999990001ZZ'
    assert df.loc[0, 'adresse-allocataire_code_insee'] == '54578'
    assert pd.isna(df.loc[0, 'allocataire-courriel_2'])


# --- Mapping ----------------------------------------------------------------------

def test_map_cnous_columns_renames_to_psp_schema():
    df = raw_row(**{
        'allocataire-adte_naissance': '14/05/2003',
        'allocataire-code_insee_commune_naissance': '54395',
        'adresse-allocataire_voie': '7 RUE DES BRAVELINES',
        'adresse-allocataire_cplt_adresse': ' | BAT C',
    })

    mapped = lib.map_cnous_columns(df)

    assert mapped.loc[0, 'allocataire-date_naissance'] == '14/05/2003'
    assert mapped.loc[0, 'allocataire-code_insee_naissance'] == '54395'
    assert mapped.loc[0, 'adresse_allocataire-voie'] == '7 RUE DES BRAVELINES'
    assert mapped.loc[0, 'adresse_allocataire-cplt_adresse'] == ' | BAT C'
    # already carrying their PSP name, left untouched
    assert mapped.loc[0, 'allocataire-matricule'] == ''
    assert 'allocataire-adte_naissance' not in mapped.columns


def test_map_cnous_columns_raises_listing_the_missing_columns():
    df = raw_row().drop(columns=['allocataire-adte_naissance', 'adresse-allocataire_voie'])

    with pytest.raises(ValueError) as error:
        lib.map_cnous_columns(df)

    assert 'allocataire-adte_naissance' in str(error.value)
    assert 'adresse-allocataire_voie' in str(error.value)


def test_set_organisme_and_situation_is_constant_for_every_row():
    df = mapped_frame(nom=['VORNIDEL', 'TRAMBOZI'])

    result = lib.set_organisme_and_situation(df)

    assert result['organisme'].tolist() == ['cnous', 'cnous']
    assert result['situation'].tolist() == ['boursier', 'boursier']


# --- Dates ------------------------------------------------------------------------

def test_normalize_allocataire_birthdate_keeps_the_french_format():
    df = mapped_frame(**{'allocataire-date_naissance': ['14/05/2003', '01/01/1998']})

    result = lib.normalize_allocataire_birthdate(df)

    assert result['allocataire-date_naissance'].tolist() == ['14/05/2003', '01/01/1998']


def test_normalize_allocataire_birthdate_nulls_an_unparsable_value():
    df = mapped_frame(**{'allocataire-date_naissance': ['2003-05-14', '', '31/02/2003']})

    result = lib.normalize_allocataire_birthdate(df)

    assert result['allocataire-date_naissance'].isna().all()


# --- Birth country ----------------------------------------------------------------

@pytest.mark.parametrize('delivered', ['', '100', None])
def test_fill_default_birth_country_iso_defaults_to_france(delivered):
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': [delivered]})

    result = lib.fill_default_birth_country_iso(df)

    assert result.loc[0, 'allocataire-code_iso_pays_naissance'] == 'FR'


def test_fill_default_birth_country_iso_keeps_and_uppercases_a_foreign_code():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['ma', 'PT']})

    result = lib.fill_default_birth_country_iso(df)

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['MA', 'PT']


def cog_pays() -> pd.DataFrame:
    """A v_pays_territoire extract, read like the real one (dtype=str, keep_default_na=False)."""
    return pd.DataFrame({
        'COG': ['99100', '99350', '99139', '99161'],
        'LIBCOG': ['France', 'Maroc', 'Portugal', 'Dépendances de la Couronne britannique'],
        'LIBENR': ['République française', 'Royaume du Maroc', 'République portugaise', ''],
        'CODEISO2': ['FR', 'MA', 'PT', ''],
    })


def birthplace_frame(insee, commune, iso) -> pd.DataFrame:
    """Text columns, as read_raw_cnous_csv delivers them even when empty throughout."""
    return pd.DataFrame({
        'allocataire-code_insee_naissance': insee,
        'allocataire-commune_naissance': commune,
        'allocataire-code_iso_pays_naissance': iso,
    }, dtype=object)


def test_fill_birth_country_iso_from_cog_reads_a_foreign_cog_code():
    df = birthplace_frame(['99350', '99139'], [np.nan, 'trelvora'], [np.nan, ''])

    result, completed = lib.fill_birth_country_iso_from_cog(df, cog_pays())

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['MA', 'PT']
    assert completed == 2


def test_fill_birth_country_iso_from_cog_reads_a_country_name_in_the_commune_column():
    df = birthplace_frame([np.nan, '99999'], ['maroc', 'Royaume du Maroc'], [np.nan, np.nan])

    result, completed = lib.fill_birth_country_iso_from_cog(df, cog_pays())

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['MA', 'MA']
    assert completed == 2


def test_fill_birth_country_iso_from_cog_never_reads_a_name_next_to_a_french_commune_code():
    df = birthplace_frame(['54395'], ['maroc'], [np.nan])

    result, completed = lib.fill_birth_country_iso_from_cog(df, cog_pays())

    assert pd.isna(result.loc[0, 'allocataire-code_iso_pays_naissance'])
    assert completed == 0


def test_fill_birth_country_iso_from_cog_keeps_delivered_and_legacy_codes():
    df = birthplace_frame(['99350', '99350'], [np.nan, np.nan], ['PT', '100'])

    result, completed = lib.fill_birth_country_iso_from_cog(df, cog_pays())

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['PT', '100']
    assert completed == 0


def test_birth_country_left_unfound_by_the_cog_defaults_to_france():
    """99161 has no ISO code and MORBELAC is no country: both end up FR."""
    df = birthplace_frame(['99161', np.nan], [np.nan, 'morbelac'], [np.nan, np.nan])

    result, completed = lib.fill_birth_country_iso_from_cog(df, cog_pays())
    result = lib.fill_default_birth_country_iso(result)

    assert result['allocataire-code_iso_pays_naissance'].tolist() == ['FR', 'FR']
    assert completed == 0


def test_add_birth_country_label_reads_the_label_off_the_iso_code():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['FR', 'MA']})

    result = lib.add_birth_country_label(df)

    assert result['allocataire-pays_naissance'].tolist() == ['FRANCE', 'MOROCCO']


def test_normalize_birthplace_casing_uppercases_the_delivered_commune():
    df = mapped_frame(**{'allocataire-commune_naissance': ['morbelac', 'st valdrène', None]})

    result = lib.normalize_birthplace_casing(df)

    assert result['allocataire-commune_naissance'].tolist()[:2] == ['MORBELAC', 'ST VALDRÈNE']
    assert pd.isna(result.loc[2, 'allocataire-commune_naissance'])


def test_add_birth_country_label_leaves_an_unknown_code_null_instead_of_raising():
    df = mapped_frame(**{'allocataire-code_iso_pays_naissance': ['XZ', 'FR']})

    result = lib.add_birth_country_label(df)

    assert pd.isna(result.loc[0, 'allocataire-pays_naissance'])
    assert result.loc[1, 'allocataire-pays_naissance'] == 'FRANCE'


# --- INSEE codes ------------------------------------------------------------------

def test_pad_insee_codes_restores_the_dropped_leading_zero():
    df = mapped_frame(**{
        'allocataire-code_insee_naissance': ['1289', '54395', '2A004', None],
        'adresse_allocataire-code_postal': ['1960', '54600', '', None],
        'adresse_allocataire-code_insee': ['1021', '2A004', '54578', None],
    })

    result = lib.pad_insee_codes(df)

    assert result['allocataire-code_insee_naissance'].tolist()[:3] == ['01289', '54395', '2A004']
    assert result['adresse_allocataire-code_postal'].tolist()[:3] == ['01960', '54600', '']
    assert result['adresse_allocataire-code_insee'].tolist()[:3] == ['01021', '2A004', '54578']
    assert result[lib.INSEE_CODE_COLUMNS].iloc[3].isna().all()


# --- Address ----------------------------------------------------------------------

def test_normalize_address_casing_unaccents_uppercases_and_blanks_empty_fields():
    df = mapped_frame(**{
        'adresse_allocataire-voie': ['9 rue Sainte-Élorine', '   ', None],
        'adresse_allocataire-commune': ['Vardèle-lès-Morbin', 'Pélurnas', None],
        'adresse_allocataire-cplt_adresse': [' | 12 rue Kestrival', '', None],
    })

    result = lib.normalize_address_casing(df)

    assert result.loc[0, 'adresse_allocataire-voie'] == '9 RUE SAINTE-ELORINE'
    assert result.loc[0, 'adresse_allocataire-commune'] == 'VARDELE-LES-MORBIN'
    assert result.loc[1, 'adresse_allocataire-commune'] == 'PELURNAS'
    assert result.loc[0, 'adresse_allocataire-cplt_adresse'] == '| 12 RUE KESTRIVAL'
    assert result.iloc[1][lib.ADDRESS_TEXT_COLUMNS].drop('adresse_allocataire-commune').isna().all()
    assert result.iloc[2][lib.ADDRESS_TEXT_COLUMNS].isna().all()


def test_normalize_address_casing_survives_a_street_blank_throughout():
    """A small file can carry no address at all."""
    df = pd.DataFrame({
        'adresse_allocataire-voie': ['', '  '],
        'adresse_allocataire-commune': ['', ''],
        'adresse_allocataire-cplt_adresse': [np.nan, np.nan],
    }, dtype=object)

    result = lib.normalize_address_casing(df)

    assert result[lib.ADDRESS_TEXT_COLUMNS].isna().all().all()


def test_normalize_address_casing_turns_double_quotes_into_single_ones():
    df = mapped_frame(**{
        'adresse_allocataire-voie': ['residence "les bravelines"'],
        'adresse_allocataire-commune': ['QUINTAVEL'],
        'adresse_allocataire-cplt_adresse': [None],
    })

    result = lib.normalize_address_casing(df)

    assert result.loc[0, 'adresse_allocataire-voie'] == "RESIDENCE 'LES BRAVELINES'"


# --- Birthdate window -------------------------------------------------------------

def test_filter_within_birthdate_window_includes_both_bounds():
    df = mapped_frame(date_naissance=pd.to_datetime(
        ['1997-12-31', '1998-01-01', '2010-06-15', '2026-12-31', '2027-01-01']))

    result, removed_count = lib.filter_within_birthdate_window(df)

    assert result['date_naissance'].dt.strftime('%Y-%m-%d').tolist() == [
        '1998-01-01', '2010-06-15', '2026-12-31']
    assert removed_count == 2


def test_describe_rows_outside_window_reports_birthdate_and_age():
    df = mapped_frame(date_naissance=pd.to_datetime(['1996-06-11', '2010-06-15']))

    described = lib.describe_rows_outside_window(df)

    assert described['date_naissance'].tolist() == ['11/06/1996']
    assert described['age_en_2026'].tolist() == [30]


def test_describe_rows_outside_window_is_empty_when_everyone_is_in_range():
    df = mapped_frame(date_naissance=pd.to_datetime(['2010-06-15']))

    described = lib.describe_rows_outside_window(df)

    assert described.empty
    assert list(described.columns) == ['date_naissance', 'age_en_2026']


# --- Deduplication ----------------------------------------------------------------

def test_drop_duplicates_on_key_keeps_the_first_row_of_each_value():
    df = mapped_frame(**{
        'allocataire-matricule': ['999990001ZZ', '999990002ZZ', '999990001ZZ'],
        'nom': ['VORNIDEL', 'PELUCHAIN', 'TRAMBOZI'],
    })

    result, dropped_count = lib.drop_duplicates_on_key(df, 'allocataire-matricule')

    assert result['nom'].tolist() == ['VORNIDEL', 'PELUCHAIN']
    assert dropped_count == 1


def test_drop_duplicates_on_key_never_merges_rows_without_a_key():
    """A missing courriel is not a shared one: those boursiers all stay."""
    df = mapped_frame(**{
        'allocataire-courriel': [np.nan, np.nan, 'kalisse.vornidel@example.org', np.nan],
        'nom': ['BARDOUZE', 'QUENDRIS', 'VORNIDEL', 'CHALVOMER'],
    })

    result, dropped_count = lib.drop_duplicates_on_key(df, 'allocataire-courriel')

    assert result['nom'].tolist() == ['BARDOUZE', 'QUENDRIS', 'VORNIDEL', 'CHALVOMER']
    assert dropped_count == 0


# --- JSON serialization -----------------------------------------------------------

def test_allocataire_json_carries_the_birth_details_and_no_empty_shared_field():
    df = mapped_frame(**{
        'allocataire-qualite': ['Mme'],
        'allocataire-matricule': ['999990001ZZ'],
        'allocataire-nom': ['VORNIDEL'],
        'allocataire-prenom': ['KALISSE'],
        'allocataire-courriel': ['kalisse.vornidel@example.org'],
        'allocataire-date_naissance': ['14/05/2003'],
        'allocataire-code_insee_naissance': ['54395'],
        'allocataire-commune_naissance': ['morbelac'],
        'allocataire-code_iso_pays_naissance': ['FR'],
        'allocataire-pays_naissance': ['FRANCE'],
    })

    df = lib.add_missing_allocataire_columns(df)
    result = partners.add_allocataire_json_column(
        df, extra_fields=lib.ALLOCATAIRE_JSON_EXTRA_FIELDS)

    assert json.loads(result.loc[0, 'allocataire']) == {
        'qualite': 'Mme',
        'matricule': '999990001ZZ',
        'nom': 'VORNIDEL',
        'prenom': 'KALISSE',
        'courriel': 'kalisse.vornidel@example.org',
        'date_naissance': '14/05/2003',
        'code_insee_commune_naissance': '54395',
        'commune_naissance': 'morbelac',
        'code_iso_pays_naissance': 'FR',
        'pays_naissance': 'FRANCE',
    }


def test_add_missing_allocataire_columns_survives_the_all_null_column_drop():
    """The columns are added after filter_rows_missing_required_fields, never before."""
    df = mapped_frame(**{
        'nom': ['VORNIDEL'],
        'prenom': ['KALISSE'],
        'genre': ['F'],
        'date_naissance': pd.to_datetime(['2003-05-14']),
    })
    df = lib.add_missing_allocataire_columns(df)

    filtered = partners.filter_rows_missing_required_fields(df)

    assert not set(lib.MISSING_ALLOCATAIRE_COLUMNS) & set(filtered.columns)


# --- Whole cleaning sequence ------------------------------------------------------

def write_raw_cnous_file(tmp_path, *lines) -> pd.DataFrame:
    filepath = tmp_path / 'cnous.csv'
    filepath.write_text('\n'.join([CNOUS_HEADER_LINE, *lines]) + '\n', encoding='utf-8')
    return lib.read_raw_cnous_csv(filepath)


def test_clean_cnous_rows_runs_the_whole_sequence_and_counts_each_step(tmp_path):
    df_raw = write_raw_cnous_file(
        tmp_path,
        # born in France: the export leaves the ISO code empty
        "2003-05-14;Vornidel;Kalisse;F;MME;999990001ZZ;VORNIDEL;Kalisse;"
        "Kalisse.Vornidel@example.org;14/05/2003;54395;morbelac;;7 rue des Bravelines;"
        "54600;Vardèle-lès-Morbin;54578;;;0Bis",
        # MSE profile left incomplete: no ISO code, but a foreign COG code
        "2004-02-03;Trambozi;Elvane;F;MME;999990002ZZ;TRAMBOZI;Elvane;"
        "elvane.trambozi@example.org;03/02/2004;99350;;;3 allee des Morvandes;1960;Pelurnas;1289;;;1",
        # no INSEE code at all, the country spelled in the commune column
        "2002-11-20;Peluchain;Dorvic;M;MR;999990003ZZ;PELUCHAIN;Dorvic;;20/11/2002;;maroc;;"
        ";;;;;;2",
        # out of the boursier window
        "1996-06-11;Quendris;Malto;M;MR;999990004ZZ;QUENDRIS;Malto;;11/06/1996;54395;morbelac;;"
        ";;;;;;3",
        # no nom: no code can be drawn
        "2005-01-09;;Zelfa;F;MME;999990005ZZ;;Zelfa;;09/01/2005;54395;morbelac;;;;;;;;4",
    )

    df, report = lib.clean_cnous_rows(df_raw, cog_pays())

    assert report == {
        'lus': 5,
        'date_allocataire_illisible': 0,
        'pays_complete_par_cog': 2,
        'pays_fr_par_defaut': 3,
        'pays_sans_libelle': 0,
        'insee_naissance_absent': 1,
        'champ_requis_manquant': 1,
        'hors_fenetre': 1,
        'retenus': 3,
    }
    assert df['nom'].tolist() == ['VORNIDEL', 'TRAMBOZI', 'PELUCHAIN']
    assert df['allocataire-code_iso_pays_naissance'].tolist() == ['FR', 'MA', 'MA']
    assert df['allocataire-qualite'].tolist() == ['Mme', 'Mme', 'M']
    assert df.loc[0, 'allocataire-courriel'] == 'kalisse.vornidel@example.org'
    assert pd.isna(df.loc[2, 'allocataire-courriel'])
    assert df.loc[1, 'adresse_allocataire-code_insee'] == '01289'
    assert df.loc[0, 'adresse_allocataire-commune'] == 'VARDELE-LES-MORBIN'
    assert df['date_naissance'].dt.hour.tolist() == [4, 4, 4]
    assert set(df['organisme']) == {'cnous'} and set(df['situation']) == {'boursier'}


def test_clean_cnous_rows_puts_back_a_column_empty_throughout(tmp_path):
    """No complément d'adresse anywhere in a small file must not break the address step."""
    df_raw = write_raw_cnous_file(
        tmp_path,
        "2003-05-14;Vornidel;Kalisse;F;MME;999990001ZZ;VORNIDEL;Kalisse;;14/05/2003;54395;"
        "morbelac;;7 rue des Bravelines;54600;Morbelac;54395;;;0Bis",
    )

    df, report = lib.clean_cnous_rows(df_raw, cog_pays())

    assert report['retenus'] == 1
    assert pd.isna(df.loc[0, 'adresse_allocataire-cplt_adresse'])
    assert pd.isna(df.loc[0, 'allocataire-courriel'])


# --- Already in lamp01 ------------------------------------------------------------

def boursiers(**columns) -> pd.DataFrame:
    """Cleaned boursiers, shaped like clean_cnous_rows' output."""
    count = len(next(iter(columns.values())))
    defaults = {
        'nom': ['VORNIDEL'] * count,
        'prenom': ['KALISSE'] * count,
        'date_naissance': pd.to_datetime(['2003-05-14 04:00:00'] * count),
        'genre': ['F'] * count,
        'allocataire-matricule': [np.nan] * count,
        'allocataire-courriel': [np.nan] * count,
    }
    return pd.DataFrame({**defaults, **columns})


def lamp_rows(*rows) -> pd.DataFrame:
    """A public.beneficiaires export, every column as text, as psql \\copy writes it."""
    columns = ['id_psp', 'nom', 'prenom', 'date_naissance', 'genre', 'organisme',
               'allocataire_matricule', 'allocataire_courriel']
    return pd.DataFrame([{column: row.get(column, '') for column in columns} for row in rows])


def test_split_already_in_lamp_matches_the_ine_of_a_cnous_row():
    df = boursiers(nom=['TRAMBOZI', 'PELUCHAIN'],
                   **{'allocataire-matricule': ['999990002zz', '999990003ZZ']})
    df_lamp = lamp_rows(
        {'id_psp': '26-AAAA-BBBB', 'nom': 'AUTRE', 'organisme': 'cnous',
         'allocataire_matricule': '999990002ZZ'},
        # same value on a CAF row: a CAF matricule, not an INE
        {'id_psp': '26-CCCC-DDDD', 'nom': 'AUTRE', 'organisme': 'CAF',
         'allocataire_matricule': '999990003ZZ'},
    )

    df_new, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_known['nom'].tolist() == ['TRAMBOZI']
    assert df_known['motif'].tolist() == ['ine']
    assert df_known['id_psp_existant'].tolist() == ['26-AAAA-BBBB']
    assert df_new['nom'].tolist() == ['PELUCHAIN']


def test_split_already_in_lamp_matches_the_courriel_of_a_cnous_row_whatever_its_casing():
    df = boursiers(**{'allocataire-courriel': ['elvane.trambozi@example.org']})
    df_lamp = lamp_rows({'id_psp': '26-AAAA-BBBB', 'nom': 'AUTRE', 'organisme': 'cnous',
                         'allocataire_courriel': 'Elvane.Trambozi@Example.org '})

    _, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_known['motif'].tolist() == ['courriel']


def test_split_already_in_lamp_matches_the_identity_on_any_organisme():
    """Accents, hyphens and the 4h shift do not hide an AAH code drawn by the CAF."""
    df = boursiers(nom=['VORNIDEL-TRAMBOZI'], prenom=['KALISSE'])
    df_lamp = lamp_rows({'id_psp': '26-AAAA-BBBB', 'nom': 'Vornidel Trambozi',
                         'prenom': 'Kalissé', 'date_naissance': '2003-05-14 00:00:00',
                         'genre': 'F', 'organisme': 'CAF'})

    _, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_known['motif'].tolist() == ['identite']
    assert df_known['id_psp_existant'].tolist() == ['26-AAAA-BBBB']


def test_split_already_in_lamp_names_the_first_criterion_that_matches():
    df = boursiers(**{'allocataire-matricule': ['999990002ZZ'],
                      'allocataire-courriel': ['kalisse.vornidel@example.org']})
    df_lamp = lamp_rows(
        {'id_psp': '26-AAAA-BBBB', 'nom': 'VORNIDEL', 'prenom': 'KALISSE',
         'date_naissance': '2003-05-14', 'genre': 'F', 'organisme': 'cnous',
         'allocataire_matricule': '999990002ZZ',
         'allocataire_courriel': 'kalisse.vornidel@example.org'})

    _, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_known['motif'].tolist() == ['ine']


def test_split_already_in_lamp_never_matches_on_a_missing_key():
    df = boursiers(nom=['TRAMBOZI'])
    df_lamp = lamp_rows({'id_psp': '26-AAAA-BBBB', 'nom': 'AUTRE', 'organisme': 'cnous'})

    df_new, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_known.empty
    assert len(df_new) == 1


def test_split_already_in_lamp_keeps_a_match_on_a_row_without_a_code():
    """MSA rows reach lamp01 before their codes are drawn."""
    df = boursiers(nom=['TRAMBOZI'])
    df_lamp = lamp_rows({'id_psp': np.nan, 'nom': 'TRAMBOZI', 'prenom': 'KALISSE',
                         'date_naissance': '2003-05-14', 'genre': 'F', 'organisme': 'MSA'})

    df_new, df_known = lib.split_already_in_lamp(df, df_lamp)

    assert df_new.empty
    assert pd.isna(df_known.iloc[0]['id_psp_existant'])


# --- Output -----------------------------------------------------------------------

def test_select_output_columns_matches_the_cnaf_final_columns_then_the_production_ones():
    """The 8 first columns are exactly what clean_cnaf_2 hands over as df_final_jeune."""
    assert lib.CNOUS_OUTPUT_COLUMNS[:8] == [
        'nom', 'prenom', 'date_naissance', 'genre',
        'organisme', 'situation', 'allocataire', 'adresse_allocataire']

    df = mapped_frame(**{column: ['x'] for column in lib.CNOUS_OUTPUT_COLUMNS})
    df['echelon'] = ['0Bis']
    df['allocataire-matricule'] = ['999990001ZZ']

    result = lib.select_output_columns(df)

    assert list(result.columns) == lib.CNOUS_OUTPUT_COLUMNS


def test_cnous_dob_window_is_the_2026_boursier_one():
    assert lib.CNOUS_DOB_MIN == datetime(1998, 1, 1)
    assert lib.CNOUS_DOB_MAX == datetime(2026, 12, 31)
