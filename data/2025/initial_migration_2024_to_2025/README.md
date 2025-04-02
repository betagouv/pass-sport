# Summary
This folder contains the necessary scripts in order to migrate beneficiaries from the previous year (2024) to the current year (2025).
Each year has its own "exercice_id" field.

## Process 
- Remove the duplicated beneficiaries (found with a SQL query)
- Remove the users that are in the RGPD list
- Update the temporal values "updated_at", "created_at", and field values for "exercice_id", "uuid_doc"
- Assign a unique code for each migrated beneficiary
- Output a CSV file ready for injection in database