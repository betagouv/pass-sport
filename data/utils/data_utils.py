import unicodedata
from typing import List
import re
import numpy as np
import pandas as pd
from datetime import date
from utils.constants import ISO_TO_COUNTRY

def unaccent_and_upper(text: str) -> str:
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ASCII', 'ignore').decode('utf-8')
    return text.upper()

def format_insee_or_postal_code(value: str):
    try:
        if value == '' or value is None or value is np.NaN:
            return value

        if isinstance(value, str) and re.search('\d[A-Z]\d{3}', value):
            print(f"Code from DOM TOM {value}, returning original value")
            return value

        return format(int(pd.to_numeric(value, errors='coerce')), '05d')
    except Exception as e:
        print(f"Casting to int impossible for value {value}, error {e}")
        return value

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