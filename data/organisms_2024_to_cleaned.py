#!/usr/bin/env python
# coding: utf-8

# In[105]:


import csv
import os
from dotenv import load_dotenv
import pandas as pd
import json

load_dotenv()

cnous_filepath = os.environ['CNOUS_PATHFILE']
msa_filepath = os.environ['MSA_PATHFILE']
cnaf_filepath = os.environ['CNAF_PATHFILE']


# In[106]:


cnous_df = pd.read_csv(cnous_filepath, nrows=50000, encoding='iso-8859-1', on_bad_lines='skip', sep=',')


# In[107]:


msa_df = pd.read_csv(msa_filepath, nrows=50000, encoding='utf-8', on_bad_lines='skip', sep=';', quoting=csv.QUOTE_NONE)


# In[108]:


cnaf_df = pd.read_csv(cnaf_filepath, nrows=50000, encoding='iso-8859-1', on_bad_lines='skip', sep=';', quoting=csv.QUOTE_NONE)


# In[109]:


# Mapping MSA

msa_column_mapping = {
    # infos allocataire (4 / 4)
    'numero_allocataire': 'allocataire-matricule',
    'organisme': 'allocataire-code_organisme',
    'qualite_allocataire': 'allocataire-qualite',
    'nom_allocataire': 'allocataire-nom',
    'prenom_allocataire': 'allocataire-prenom',
    'date_de_naissance_alloc': 'allocataire-date_naissance',
    'pays_de_naissance': 'allocataire-pays_naissance',
    'code_insee_commune_alloc':'allocataire-code_insee_commune_naissance',
    'commune_de_naissance': 'allocataire-commune_naissance',
    'code_iso_pays': 'allocataire-code_iso_pays_naissance',
    'adresse_de_messagerie': 'allocataire-courriel',
    'numero_tel_portable': 'allocataire-telephone',

    # adresse allocataire (4 / 6 attendus) 
    # pas de voie
    'nom_commune': 'adresse_allocataire-commune',
    'code_postal': 'adresse_allocataire-code_postal',
    'code_insee_commune': 'adresse_allocataire-code_insee',
    'complement_adresse' :'adresse_allocataire-cplt_adresse',

    # infos bénéficiaires (4 / 4 attendus)
    'nom_beneficiaire': 'nom',
    'prenom_beneficiaire': 'prenom',
    'genre_beneficiaire': 'genre',
    'date_de_naissance_beneficiaire': 'date_naissance'
}

df_psp_mapped_msa = msa_df.copy()
df_psp_mapped_msa = df_psp_mapped_msa.rename(columns=msa_column_mapping) 

# situation
df_psp_mapped_msa['situation'] = 'Jeune'
mask_nom_equal = df_psp_mapped_msa['allocataire-nom'] == df_psp_mapped_msa['nom'] 
mask_prenom_equal = df_psp_mapped_msa['allocataire-prenom'] == df_psp_mapped_msa['prenom']
df_psp_mapped_msa.loc[mask_nom_equal & mask_prenom_equal, 'situation'] =  'AAH'

# organisme
df_psp_mapped_msa['organisme'] = 'MSA'

# nom adresse postale de l'allocataire
df_psp_mapped_msa['adresse_allocataire-nom_adresse_postale'] = msa_df['qualite_destinataire'] + ' ' + msa_df['nom_destinataire'] + ' ' + msa_df['prenom_destinataire']

# voie de l'adresse postale de l'allocataire
df_psp_mapped_msa['adresse_allocataire-voie'] = msa_df['numero_voie'] + ' ' + msa_df['complement_numero_voie'] + ' ' + msa_df['type_voie'] + msa_df['voie']

# sexe
df_psp_mapped_msa['genre'] = df_psp_mapped_msa['genre'].replace('1', 'M')
df_psp_mapped_msa['genre'] = df_psp_mapped_msa['genre'].replace('2', 'F')

# qualite allocataire
df_psp_mapped_msa['allocataire-qualite'] = df_psp_mapped_msa['allocataire-qualite'].replace('MME', 'Mme')
df_psp_mapped_msa['allocataire-qualite'] = df_psp_mapped_msa['allocataire-qualite'].replace('MR', 'M')

# code commune de naissance de l'allocataire
df_psp_mapped_msa['allocataire-code_insee_commune_naissance'] = df_psp_mapped_msa['allocataire-code_insee_commune_naissance'].replace('0', None)

# date de naissance allocataire
df_psp_mapped_msa['allocataire-date_naissance'] = df_psp_mapped_msa['allocataire-date_naissance'].replace(0, None)
df_psp_mapped_msa['allocataire-date_naissance'] = pd.to_datetime(df_psp_mapped_msa['allocataire-date_naissance'], format='%Y%m%d')
df_psp_mapped_msa['allocataire-date_naissance'] = df_psp_mapped_msa['allocataire-date_naissance'].dt.strftime('%d/%m/%Y')

# date de naissance bénéficiaire
df_psp_mapped_msa['date_naissance'] = pd.to_datetime(df_psp_mapped_msa['date_naissance'], format='%Y%m%d')
df_psp_mapped_msa['date_naissance'] = df_psp_mapped_msa['date_naissance'].dt.strftime('%d/%m/%Y')
# Calcul AEEH fait après le merge des 3 fichiers

# remove unused 
df_psp_mapped_msa = df_psp_mapped_msa.drop(columns=[
'nom_destinataire',
'prenom_destinataire',
'qualite_destinataire',
'numero_voie',
'complement_numero_voie',
'type_voie',
'voie'
])


# In[110]:


# Mapping CNAF

cnaf_column_mapping = {
    # infos allocataire
    'matricul': 'allocataire-matricule',
    'numorg': 'allocataire-code_organisme',
    'qualite': 'allocataire-qualite',
    'nom': 'allocataire-nom',
    'prenom': 'allocataire-prenom',
    
    # adresse allocataire
    'code_postal': 'adresse_allocataire-code_postal',
    'commune': 'adresse_allocataire-commune',
    'adresse': 'adresse_allocataire-voie',
    'code_insee': 'adresse_allocataire-code_insee',

    # infos allocataire
    'dt_naissance': 'allocataire-date_naissance',
    'mail': 'allocataire-courriel',
    'tel': 'allocataire-telephone',
    'nom_eligible': 'nom',
    'prenom_eligible': 'prenom',
    'sexe_eligible': 'genre',
    
    # infos bénéficiaires
    'dt_naissance_eligible': 'date_naissance',
}

df_psp_mapped_cnaf = cnaf_df.copy()
df_psp_mapped_cnaf = df_psp_mapped_cnaf.rename(columns=cnaf_column_mapping) 

# qualité allocataire
df_psp_mapped_cnaf['allocataire-qualite'] = df_psp_mapped_cnaf['allocataire-qualite'].replace('Madame', 'Mme')
df_psp_mapped_cnaf['allocataire-qualite'] = df_psp_mapped_cnaf['allocataire-qualite'].replace('Monsieur', 'M')

# voie de l'adresse postale de l'allocataire
df_psp_mapped_cnaf['adresse_allocataire-cplt_adresse'] = cnaf_df['compl_adresse1'] + ' ' + cnaf_df['compl_adresse2'] + ' ' + cnaf_df['compl_adresse3']

# organisme
df_psp_mapped_cnaf['organisme'] = 'CAF'

# sexe
df_psp_mapped_cnaf['genre'] = df_psp_mapped_cnaf['genre'].replace('Masculin', 'M')
df_psp_mapped_cnaf['genre'] = df_psp_mapped_cnaf['genre'].replace('Féminin', 'F')

# situation
df_psp_mapped_cnaf['situation'] = 'Jeune'
mask_nom_equal = df_psp_mapped_cnaf['allocataire-nom'] == df_psp_mapped_cnaf['nom'] 
mask_prenom_equal = df_psp_mapped_cnaf['allocataire-prenom'] == df_psp_mapped_cnaf['prenom']
df_psp_mapped_cnaf.loc[mask_nom_equal & mask_prenom_equal, 'situation'] =  'AAH'
# Calcul AEEH fait après le merge des 3 fichiers


# remove unused 
df_psp_mapped_cnaf = df_psp_mapped_cnaf.drop(columns=[
'compl_adresse1',
'compl_adresse2',
'compl_adresse3',
])



# In[111]:


# TODO: Mapping CNOUS

cnous_column_mapping = {
    # infos allocataire
    'ine': 'allocataire-matricule',
    # pas de code organisme
    'civiliteLibelleCourt': 'allocataire-qualite',
    'nom': 'allocataire-nom',
    'prenom': 'allocataire-prenom',
    'dateNaissance': 'allocataire-date_naissance',
    'mail': 'allocataire-courriel',
    'lieuNaissCodeCommuneInsee': 'allocataire-code_insee_commune_naissance',
    'lieuNaissLibelleCommune': 'allocataire-commune_naissance',
    'lieuNaissCodePays': 'allocataire-code_iso_pays_naissance',
    'lieuNaissLibellePays': 'allocataire-pays_naissance',

    # adresse allocataire
    'adresseVoie': 'adresse_allocataire-voie',
    'adresseCodePostal': 'adresse_allocataire-code_postal',
    'adresseLocalite': 'adresse_allocataire-commune',
    'adresseCodeLocalite': 'adresse_allocataire-code_insee',
    'adresseComplement1': 'adresse_allocataire-cplt_adresse',
    'adresseComplement2': '',
    'adresseCodePays': '-',

    
    '-': 'situation',

    # infos bénéficiaires
    'nom': 'nom',
    'prenom': 'prenom',
    'genre': 'civiliteLibelleCourt',
    'date_naissance': 'dateNaissance'
}


df_psp_mapped_cnous = cnous_df.copy()
df_psp_mapped_cnous = df_psp_mapped_cnous.rename(columns=cnous_column_mapping) 

# organisme
df_psp_mapped_cnous['organisme'] = 'CNOUS'


# # Merge dans un seul dataframe cible pour BDD Postgresql

# In[112]:


# Concat into a single dataframe
df_all = pd.concat([df_psp_mapped_cnaf, df_psp_mapped_cnous, df_psp_mapped_msa], axis=0, ignore_index=True)
# Remove invalid data rows and print them to stdout
necessary_column = ['nom', 'prenom', 'date_naissance', 'genre', 'allocataire-nom', 'allocataire-prenom']
df_all_valid = df_all.dropna(subset=necessary_column) 
df_all_valid = df_all_valid.dropna(axis=1, how='all')
df_all_valid['date_naissance'] = pd.to_datetime(df_all_valid['date_naissance'], format='%d/%m/%Y')


# # Application des critères d'éligibilité

# In[113]:


from datetime import datetime

# ARS

start_date = datetime(2006, 9, 16).date()
end_date = datetime(2018, 12, 31).date()

caf_or_msa_filter = (df_all_valid['organisme'] == 'CAF') | (df_all_valid['organisme'] == 'MSA')
date_naissace_within = (df_all_valid['date_naissance'].dt.date >= start_date) & (df_all_valid['date_naissance'].dt.date <= end_date)
situation_jeune = ((df_all_valid['situation'].str.lower() == 'jeune'))

ars_situation_mask = (caf_or_msa_filter & date_naissace_within & situation_jeune)


# In[114]:


# AEEH

start_date = datetime(2004, 6, 1).date()
end_date = datetime(2018, 12, 31).date()

date_naissace_within = (df_all_valid['date_naissance'].dt.date >= start_date) & (df_all_valid['date_naissance'].dt.date <= end_date)

aeeh_situation_mask = (caf_or_msa_filter & date_naissace_within & situation_jeune)


# In[115]:


# AAH

start_date = datetime(1993, 9, 16).date()
end_date = datetime(2008, 12, 31).date()

date_naissace_within = (df_all_valid['date_naissance'].dt.date >= start_date) & (df_all_valid['date_naissance'].dt.date <= end_date)
sitation_aah =(df_all_valid['situation'].str.lower()  == 'aah')

aah_situation_mask = (caf_or_msa_filter & date_naissace_within & sitation_aah)


# In[116]:


# CNOUS

from datetime import timedelta

end_date = pd.to_datetime('today').date()
start_date = end_date - timedelta(days=28*365) # Année bissextile => Problème

cnous_situation_mask = (df_all_valid['organisme'] == 'CNOUS') & (df_all_valid['date_naissance'].dt.date >= start_date) & (df_all_valid['date_naissance'].dt.date <= end_date)


# In[117]:


# Application des critères d'éligibilité
df_all_valid_filtered = df_all_valid[cnous_situation_mask | aah_situation_mask | ars_situation_mask | aeeh_situation_mask]


# In[118]:


# Ajout 4h sur toutes les dates de naissance
df_all_valid_filtered['date_naissance'] = df_all_valid_filtered['date_naissance'] + timedelta(hours=4)


# In[123]:


# Mapping to json value 
df_all_valid_filtered['allocataire'] = df_all_valid_filtered.apply(lambda row: json.dumps ({
    'qualite': row['allocataire-qualite'],
    'matricule': row['allocataire-matricule'],
    'code_organisme': row['allocataire-code_organisme'],
    'telephone': row['allocataire-telephone'],
    'nom': row['allocataire-nom'],
    'prenom': row['allocataire-prenom'],
    'dateNaissance': row['allocataire-date_naissance'],
    'courriel': row['allocataire-courriel'],
    'code_insee_commune_naissance': row['allocataire-code_insee_commune_naissance'],
    'commune_naissance': row['allocataire-commune_naissance'],
    'code_iso_pays_naissance': row['allocataire-code_iso_pays_naissance'],
    'pays_naissance': row['allocataire-pays_naissance'],
}), axis=1)

def to_json_adresse_without_null(row):
    adresse_mapping = {
        'voie': row['adresse_allocataire-voie'],
        'code_postal': row['adresse_allocataire-code_postal'],
        'nom_adresse_postale': row['adresse_allocataire-nom_adresse_postale'],
        'commune': row['adresse_allocataire-commune'],
        'code_insee': row['adresse_allocataire-code_insee'],
        'cplt_adresse': row['adresse_allocataire-cplt_adresse'],
    }
    filtered_address = {k: v for k, v in adresse_mapping.items() if pd.notnull(v)}
    return json.dumps(filtered_address)



df_all_valid_filtered['adresse_allocataire'] = df_all_valid_filtered.apply(to_json_adresse_without_null, axis=1)

df_all_valid_filtered_formated = df_all_valid_filtered.drop(columns=[
'allocataire-qualite',
'alocataire-matricule',
'allocataire-code_organisme',
'allocataire-nom',
'allocataire-prenom',
'nb_eligibles',
'allocataire-telephone',
'allocataire-date_naissance',
'allocataire-courriel',
'allocataire-code_insee_commune_naissance',
'allocataire-commune_naissance',
'allocataire-code_iso_pays_naissance',
'allocataire-pays_naissance',
'adresse_allocataire-voie',
'adresse_allocataire-nom_adresse_postale',
'adresse_allocataire-code_postal',
'adresse_allocataire-commune',
'adresse_allocataire-code_insee',
'adresse_allocataire-cplt_adresse',
])


# In[120]:


# Ajout des columns manquante par défault à false (qpv,zrr, a_valider)

