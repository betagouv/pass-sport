from typing import List

import pandas as pd

def clean_phone_number_in_place(df: pd.DataFrame, column_name="allocataire_telephone") -> None:
    """
    Adds a '0' prefix to phone numbers that:
    1.  Do not start with '0'.
    2.  Have a length of 9 characters.
    """
    require_columns([column_name], df)

    df[column_name] = df[column_name].fillna('')
    mask_no_zero_phone_number = ~df[column_name].str.startswith('0')
    mask_9_char_phone = df[column_name].str.len() == 9
    final_mask = mask_no_zero_phone_number & mask_9_char_phone

    print(
        f"Number of beneficiaries with phone cleaned : {len(df[mask_no_zero_phone_number & mask_9_char_phone])}"
    )

    # Add zero to theses matches
    df.loc[final_mask, 'allocataire_telephone'] = '0' + df['allocataire_telephone']


def internationalize_phone_number_in_place(df: pd.DataFrame) -> None:
    require_columns(['telephone'], df)

    df['telephone'] = df['telephone'].replace('^0', '+33', regex=True)


def format_benef_birth_date_in_place(df: pd.DataFrame) -> None:
    """
    Format beneficiary birth date with the following format: %Y-%m-%d
    """
    require_columns(['beneficiaire_date_naissance'], df)

    df['beneficiaire_date_naissance'] = pd.to_datetime(
        df['beneficiaire_date_naissance'].apply(lambda v: v[:10]),
        format='%Y-%m-%d'
    )

    df['beneficiaire_date_naissance'] = df['beneficiaire_date_naissance'].dt.strftime('%d/%m/%Y')


def format_born_text_in_place(df: pd.DataFrame) -> None:
    """
    Format beneficiary born text
    """
    require_columns(['beneficiaire_genre'], df)

    # Initialise with default text
    df.loc[:, 'neele'] = 'Né le'
    mask_girl = df['beneficiaire_genre'] == 'F'
    df.loc[mask_girl, 'neele'] = 'Née le'


def format_allocataire_benef_names_in_place(df: pd.DataFrame) -> None:
    """
    Capitalizes the first letter of 'allocataire_prenom', 'allocataire_nom',
    'beneficiaire_prenom', and 'beneficiaire_nom' columns in-place.
    Raises ValueError if any of the required columns are missing.
    """
    require_columns(['allocataire_prenom', 'allocataire_nom',
                     'beneficiaire_prenom', 'beneficiaire_nom'], df)

    df.loc[:,'allocataire_prenom'] = df['allocataire_prenom'].astype(str).str.capitalize()
    df.loc[:,'allocataire_nom'] = df['allocataire_nom'].astype(str).str.capitalize()
    df.loc[:,'beneficiaire_prenom'] = df['beneficiaire_prenom'].astype(str).str.capitalize()
    df.loc[:,'beneficiaire_nom'] = df['beneficiaire_nom'].astype(str).str.capitalize()


def get_indirect_beneficiaries(df: pd.DataFrame) -> pd.DataFrame:
    require_columns(['beneficiaire_prenom', 'allocataire_prenom'], df)

    mask_alloc_diff_benef = df['beneficiaire_prenom'].str.lower() != df[
        'allocataire_prenom'].str.lower()

    return df[mask_alloc_diff_benef]


def get_direct_beneficiaries(df: pd.DataFrame) -> pd.DataFrame:
    require_columns(['beneficiaire_prenom', 'allocataire_prenom'], df)

    mask_alloc_eq_benef = df['beneficiaire_prenom'].str.lower() == df[
        'allocataire_prenom'].str.lower()

    return df[mask_alloc_eq_benef]


def require_columns(required_columns: List[str], df: pd.DataFrame) -> None:
    """
    Raises ValueError if any of the specified columns are missing in the DataFrame.
    """
    for column in required_columns:
        if column not in df.columns:
            raise ValueError(f"Column '{column}' not found in DataFrame.")

