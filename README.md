# pass Sport offical source code
![pass Sport](site/public/images/pass-sport-logo.svg)

## Frontend
### Stack
- NextJs
- Typescript
- React DSFR

### How to run the website
> npm install && npm run dev

### How to run the tests
> npm run test

## Third party APIs used
- https://lecompteasso.associations.gouv.fr
  - Used for eligibility purposes 
- https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/records
  - Used to fetch list of clubs that are within the pass Sport

Commune/postal-code search data (used by the club finder and the eligibility test's birth-place
field) is embedded in `site/src/data/communes.json` instead of calling an external API, built
from La Poste's ["Base officielle des codes postaux"](https://www.data.gouv.fr/datasets/base-officielle-des-codes-postaux)
and INSEE's ["Code officiel géographique"](https://www.insee.fr/fr/information/2560452), updated
~1-2x/year. To refresh: download the latest CSV from each source, then from `site/` run
`LAPOSTE_CSV_PATH=<path> COG_CSV_PATH=<path> pnpm run generate:communes` and commit the updated
`src/data/communes.json` via a normal PR.

## Backend - Data processing
### Stack
- Jupyter Notebooks
- Python
- Pandas

Everything is processed with jupyter notebooks mostly

## CI
### Scalingo
Every time a PR gets created, a review app is spinned up.
At every deployment on main, the staging environment gets deployed.

### Configuration
Copy paste the contents from .env.example.local to .env and fill the fields with a team member.
