#!/usr/bin/env python
# coding: utf-8

# In[12]:


import random
import string
from datetime import datetime

current_date = datetime.today()
current_year = str(current_date.year)[-2:]

def get_characters_set(size = 4):
    return ''.join(random.choices([c for c in string.ascii_uppercase if c not in 'OI'], k=size))
    
def generate_code():
    return f"{current_year}-{get_characters_set(4)}-{get_characters_set(4)}"


# In[13]:


import uuid
from faker import Faker
import random
from datetime import datetime
from dateutil import rrule

Faker.seed(0)
fake = Faker('fr_FR')

def random_date():
    # Arbitrary start_date & end_date as we're not testing eligibility here
    start_date = datetime(1993, 1, 1)
    end_date = datetime(2018, 12, 31)
    dates = list(rrule.rrule(rrule.DAILY, dtstart=start_date, until=end_date))
    random_date_within_range = random.choice(dates)

    return random_date_within_range


def generate_data(gender = 'M', different_name = False, upper_case_names = False):
    id = str(uuid.uuid4())
    last_name = fake.last_name_female() if gender == 'F' else fake.last_name()
    first_name = fake.first_name_female() if gender == 'F' else fake.first_name()
    organisms = ["CAF", "MSA"]
    titles = ["MME", "MR"]

    return {
        "id": id,
        "id_psp": generate_code(), # We don't care about unicity for this fixture
        "nom": last_name.upper() if upper_case_names else last_name,
        "prenom": first_name.upper() if upper_case_names else first_name,
        "date_naissance": random_date().strftime('%Y-%m-%d') , # We don't care about birth dates that meet eligibility conditions
        "genre": gender,
        "organisme": random.choice(organisms),
        "situation": "Jeune",
        "allocataire": {
            # In case the allocataire is same as beneficiaire, we want the uppercase names to match the non uppercase names
            "prenom": fake.first_name() if different_name else first_name,
            "nom": fake.last_name() if different_name else last_name,
            "courriel": fake.email(),
            "qualite": random.choice(titles)
        }
    }


# In[14]:


import pandas as pd
import os
from dotenv import load_dotenv
import json

load_dotenv()

pathfile_benef_2024 = os.environ['TEST_BENEF_2024_PATHFILE']

beneficiaires_eq_allocataires = (
    generate_data(),
    generate_data(upper_case_names = True),
    generate_data(gender = 'F'),
    generate_data(gender = 'F', upper_case_names = True)
)

beneficiaires_not_eq_allocataires = (
    generate_data(different_name=True),
    generate_data(different_name=True, upper_case_names = True),
    generate_data(gender = 'F', different_name=True),
    generate_data(gender = 'F', different_name=True, upper_case_names = True)
)

all = [
    *beneficiaires_eq_allocataires,
    *beneficiaires_not_eq_allocataires
]

df = pd.DataFrame(all)

# Convert "allocataire" object to JSON format
df['allocataire'] = df['allocataire'].apply(json.dumps)
df.to_csv(pathfile_benef_2024, index=False)


