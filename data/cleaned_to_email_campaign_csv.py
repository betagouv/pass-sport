#!/usr/bin/env python
# coding: utf-8

# # Génération d'un export de données pour les campagnes de mails
# 
# ## Traitements 
# 
# 1. Chargemement du fichier CSV 2024
# 2. Extraction du json d'allocataire en columns 
# 3. Mapping des données et suppression des données inutiles
# 4. Génération de l'url et de sa signature pour éviter les altérations
# 5. Sérialisation en .csv
# 
# Génération de 2 csvs distincts en fonction de si allocataire = bénéficiaire et si allocataire != bénéficiaire 
# 

# In[32]:


import pandas as pd
from dotenv import load_dotenv
import os
import json

load_dotenv()

pathfile_benef_2024 = os.environ['BENEF_2024_PATHFILE']
qr_code_signature_secret = os.environ['BENEF_2024_QR_CODE_URL_SECRET']
qr_code_base_url = os.environ['BENEF_2024_QR_CODE_BASE_URL']
pathfile_campaign_csv_output_b = os.environ['CAMPAIGN_CSV_OUTPUT_B']
pathfile_campaign_csv_output_b_and_a = os.environ['CAMPAIGN_CSV_OUTPUT_B_AND_A']


# In[33]:


df_main = pd.read_csv(pathfile_benef_2024, index_col=0, sep=',')


# In[34]:


df_json_normalized = pd.json_normalize(df_main['allocataire'].apply(json.loads))
df_json_normalized = df_json_normalized.add_prefix('allocataire_')


# In[35]:


df_main.index = pd.RangeIndex(start=0, stop=len(df_main), step=1)


# In[36]:


df_unwrapped_alloc = pd.merge(df_main, df_json_normalized, left_index=True, right_index=True)


# In[37]:


column_mapping = {
    'allocataire_courriel': 'email',
    'allocataire_qualite': 'allocataire_qualite',
    'allocataire_nom': 'allocataire_nom',
    'allocataire_prenom': 'allocataire_prenom',
    'prenom': 'beneficiaire_prenom',
    'nom': 'beneficiaire_nom',
    'genre': 'beneficiaire_genre',
    'date_naissance': 'beneficiaire_date_naissance',
    'id_psp': 'code',
}

# df_formatted = df_unwrapped_alloc.rename(columns=column_mapping) 
df_unwrapped_alloc.columns = df_unwrapped_alloc.columns.to_series().replace(column_mapping)


# In[38]:


df_campaign = df_unwrapped_alloc[['email','allocataire_qualite',
'allocataire_nom',
'allocataire_prenom','beneficiaire_prenom', 'beneficiaire_nom', 'beneficiaire_genre', 'beneficiaire_date_naissance', 'code']]


# In[39]:


# new format for birth date
df_campaign['beneficiaire_date_naissance'] = pd.to_datetime(df_campaign['beneficiaire_date_naissance'].apply(lambda v: v[:10]), format='%Y-%m-%d')
df_campaign['beneficiaire_date_naissance'] = df_campaign['beneficiaire_date_naissance'].dt.strftime('%d/%m/%Y')


# In[40]:


# Ajout d'une colonne pour le sexe 
df_campaign['neele'] = 'Né le'
mask_girl = df_campaign['beneficiaire_genre'] == 'F'
df_campaign.loc[mask_girl, 'neele'] =  'Née le'


# In[61]:


df_campaign['allocataire_prenom'] = df_campaign['allocataire_prenom'].astype(str).apply(lambda x: x.capitalize())
df_campaign['allocataire_nom'] = df_campaign['allocataire_nom'].astype(str).apply(lambda x: x.capitalize())
df_campaign['beneficiaire_prenom'] = df_campaign['beneficiaire_prenom'].astype(str).apply(lambda x: x.capitalize())
df_campaign['beneficiaire_nom'] = df_campaign['beneficiaire_nom'].astype(str).apply(lambda x: x.capitalize())


# In[71]:


# Génération csv dans le cas allocataire = bénéficiaire
mask_alloc_diff_benef = df_campaign['beneficiaire_prenom'].str.lower() != df_campaign['allocataire_prenom'].str.lower()
df_alloc_diff_benef = df_campaign[mask_alloc_diff_benef]


# In[70]:


# Génération csv dans le cas allocataire != bénéficiaire
mask_alloc_eq_benef = df_campaign['beneficiaire_prenom'].str.lower() == df_campaign['allocataire_prenom'].str.lower()
df_alloc_eq_benef = df_campaign[mask_alloc_eq_benef]


# In[65]:


# # Génération des URLs pour le QR code
# import hmac
# import hashlib
# import urllib.parse

# key_mapping = { 'beneficiaire_prenom': 'bp', 'beneficiaire_nom': 'bn', 'beneficiaire_genre' : 'bg', 'beneficiaire_date_naissance': 'bdn', 'code': 'c'}

# def generate_signature(secret_key, data):
#     secret_key_bytes = secret_key.encode('utf-8')
#     data_bytes = data.encode('utf-8')

#     signature = hmac.new(secret_key_bytes, data_bytes, hashlib.sha256).hexdigest()

#     return signature

# def generate_url_column(row):
#     params = {key_mapping.get(column): row[column] for column in df_campaign.columns}
#     encoded_params = urllib.parse.urlencode(params)
#     unencoded_string = f"{qr_code_base_url}?{encoded_params}"
#     signature_hash = generate_signature(qr_code_signature_secret, unencoded_string)
#     url_with_signature = f"{unencoded_string}&signature={signature_hash}"
#     return url_with_signature
    
# # del df_unwrapped_alloc['url_qr_code']

# df_campaign['url_qr_code'] = df_campaign.apply(generate_url_column, axis=1)


# In[66]:


# (Opt) Ajout de la taille de l'URL
# df_campaign['url_qr_code_len'] = df_campaign['url_qr_code'].apply(lambda x: len(x))


# In[67]:


# (Opt) Check sur la longueur des URLs
# mask_max_len_filter = df_campaign['url_qr_code'].apply(lambda x: len(x)) > 255
# df_excedeed = df_campaign[mask_max_len_filter]


# In[72]:


df_alloc_eq_benef[['email','beneficiaire_prenom', 'beneficiaire_nom']].to_csv(pathfile_campaign_csv_output_b, index=False)
df_alloc_diff_benef[['email','beneficiaire_prenom', 'beneficiaire_nom', 'allocataire_nom', 'allocataire_prenom']].to_csv(pathfile_campaign_csv_output_b_and_a, index=False)

