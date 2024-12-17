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
- https://geo.api.gouv.fr
  - Used to get list of communes 
- https://lecompteasso.associations.gouv.fr
  - Used for eligibility purposes 
- https://sports-sgsocialgouv.opendatasoft.com/api/explore/v2.1/catalog/datasets/passsports-asso_volontaires/records
  - Used to fetch list of clubs that are within the pass Sport

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
