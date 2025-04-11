import unicodedata
from typing import List
import pandas as pd

def unaccent_and_upper(text: str) -> str:
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ASCII', 'ignore').decode('utf-8')
    return text.upper()

def format_insee_or_postal_code(value: str) -> str:
    return format(pd.to_numeric(value, errors='coerce'), '05d')

def require_columns(required_columns: List[str], df: pd.DataFrame) -> None:
    """
    Raises ValueError if any of the specified columns are missing in the DataFrame.
    """
    for column in required_columns:
        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found in DataFrame.")
