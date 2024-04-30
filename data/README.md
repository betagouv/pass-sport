# Data manipulation for pass Sport

## Python (3.10.12)

## Create virtualenv

You can use vscode python extension or

```bash
virtualenv .venv
```

## Use python virtual env

Vscode does this automatically with a new terminal
when the Python Environment Manager extension is installed.

```bash
source ./.venv/bin/activate
```

Copy the `.env.example` to `.env` and setup the required variables.
It is loaded in scripts by `load_dotenv()` from `dotenv`.

## Exit python virtual env

```bash
deactivate
```

## Install requirements (with venv activated)

```bash
pip install -r requirements.txt
```

## Install pre-commit hook to prevent sensitive data to be added to the repo

This will create a pre-commit hook in `.git` folder

```
pre-commit install
```

See https://zhauniarovich.com/post/2020/2020-06-clearing-jupyter-output/

## For review
For easier review

```
jupyter nbconvert --to script pass_sport_2023_cleanup.ipynb
jupyter nbconvert --to script cleaned_to_email_campaign_csv.ipynb
jupyter nbconvert --to script fixtures_for_mailing_campaigns_script.ipynb
```
