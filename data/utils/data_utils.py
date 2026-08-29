import unicodedata
from typing import List
import re
import numpy as np
import pandas as pd
from datetime import date, timedelta
from .constants import ISO_TO_COUNTRY

def unaccent_and_upper(text: str) -> str:
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ASCII', 'ignore').decode('utf-8')
    return text.upper()

def format_insee_or_postal_code(value: str):
    try:
        if value == '' or value is None or value is np.nan:
            return value

        if isinstance(value, str) and re.search(r'\d[A-Z]\d{3}', value):
            print(f"Code from DOM TOM {value}, returning original value")
            return value

        return format(int(pd.to_numeric(value, errors='coerce')), '05d')
    except Exception as e:
        print(f"Casting to int impossible for value {value}, error {e}")
        return value

# INSEE commune codes and French postal codes are both 5 characters wide.
INSEE_OR_POSTAL_CODE_LENGTH = 5

def pad_insee_or_postal_codes(codes: pd.Series) -> pd.Series:
    """
    Restores the leading zeros an export drops from INSEE / postal codes (9122 -> 09122).

    Only values made exclusively of 1 to 4 digits are padded, which is exactly what a
    numeric round trip through the partner's system loses: the codes of the départements
    01 to 09 (Foix: postal 9000 -> 09000, commune 9122 -> 09122). Everything else is
    returned untouched - a null stays null, an empty string stays empty, an already
    5-digit code is left alone, and a Corsican or overseas code carrying a letter
    (2A004, 2B033) is never fed through an int cast that would lose it.
    """
    text = codes.astype('string')
    needs_padding = text.str.fullmatch(r'\d{1,4}').fillna(False)
    return codes.mask(needs_padding, text.str.zfill(INSEE_OR_POSTAL_CODE_LENGTH))

def require_columns(required_columns: List[str], df: pd.DataFrame) -> None:
    """
    Raises ValueError if any of the specified columns are missing in the DataFrame.
    """
    for column in required_columns:
        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found in DataFrame.")

def get_current_date_for_file_name(filename: str) -> str:
    today = date.today()
    return f"{today.strftime("%Y-%m-%d")}-{filename}"

def get_country_from_iso(countr_iso: str) -> str:
    return ISO_TO_COUNTRY[countr_iso.upper()]

def add_missing_leading_zero(phone: pd.Series) -> pd.Series:
    """
    Adds the missing '0' prefix to 9-digit phone numbers (612345678 -> 0612345678).

    Values that are null, already prefixed with '0', or of any other length are
    returned unchanged - null stays null rather than becoming an empty string.
    """
    needs_zero = (
        phone.notna()
        & ~phone.str.startswith('0', na=False)
        & (phone.str.len() == 9)
    )
    return phone.mask(needs_zero, '0' + phone)

def shift_dates_by_hours(dates: pd.Series, hours: int) -> pd.Series:
    """
    Offsets datetimes by a fixed number of hours.

    Partner birthdates are parsed as naive midnight values and stored shifted by a few
    hours, so that a timezone conversion down the line cannot roll them onto the
    previous day.
    """
    return dates + timedelta(hours=hours)

def drop_rows_missing_values(df: pd.DataFrame, required_columns: List[str]) -> pd.DataFrame:
    """
    Removes rows missing any of the required values, then columns left entirely null.

    Beneficiaries missing one of those values cannot get a code generated.
    Raises AssertionError if a required column still holds a null value afterwards.
    """
    df_valid_row = df.dropna(subset=required_columns)
    df_valid = df_valid_row.dropna(axis=1, how='all')

    remaining_required = [column for column in required_columns if column in df_valid.columns]
    assert not df_valid[remaining_required].isnull().any().any()

    return df_valid

def normalize_country_label(label) -> str:
    """
    Folds a country label to a form comparable across sources.

    Punctuation becomes a space *before* the ascii fold, which would otherwise drop the
    apostrophe of "Côte d'Ivoire" and glue the two words together.
    """
    return re.sub(r'\s+', ' ', unaccent_and_upper(re.sub(r'[^\w]+', ' ', str(label)))).strip()

def build_country_cog_lookup(df_cog_pays: pd.DataFrame) -> pd.Series:
    """
    Builds a normalized country label -> INSEE COG code lookup from v_pays_territoire.

    LIBCOG first, LIBENR ("Royaume du Maroc") as a fallback spelling for the same COG.
    Labels are compared unaccented/uppercased, since partner files are often ascii-encoded
    while the COG file is not.
    """
    cog_by_country_label = pd.concat([
        df_cog_pays[['LIBCOG', 'COG']].rename(columns={'LIBCOG': 'label'}),
        df_cog_pays[['LIBENR', 'COG']].rename(columns={'LIBENR': 'label'}),
    ])
    cog_by_country_label['label'] = cog_by_country_label['label'].map(normalize_country_label)
    return cog_by_country_label[cog_by_country_label['label'] != ''].drop_duplicates(
        subset='label', keep='first').set_index('label')['COG']