# Data manipulation for pass Sport

## Python (3.10.12)

## Create virtualenv

You can use vscode python extension or

```bash
virtualenv .venv
```

## Use python virtual env

Vscode does this automatically with a new terminal
when the Python Environment Manager extension is installed.
```bash
source ./.venv/bin/activate
```

Copy the `.env.example` to `.env` and setup the required variables.
It is loaded in scripts by `load_dotenv()` from `dotenv`.


## Exit python virtual env

```bash
deactivate
```

## Install requirements (with venv activated)
```bash
pip install -r requirements.txt
```


## Install pre-commit hook to prevent sensitive data to be added to the repo

This will create a pre-commit hook in `.git` folder
```
pre-commit install
```
See https://zhauniarovich.com/post/2020/2020-06-clearing-jupyter-output/


## For review
For easier review
```
jupyter nbconvert --to script pass_sport_2023_cleanup.ipynb
```

## Run the SQL matching integration tests

`2026/partners/franceconnect/test_match_beneficiaires.py` replays
`match_beneficiaires.sql` against a throwaway `postgres:18-alpine` container carrying the
`lamp01/db-init` schema, so it needs a running docker engine. From `data/`, this one-liner
starts Docker Desktop, runs the tests, then tears the engine down whatever the outcome
(`;` — the teardown must run even when a test fails):

```bash
source .venv/bin/activate && python -m pytest 2026/partners/franceconnect/test_match_beneficiaires.py -v
```

The test container itself is created and removed by the pytest session fixture; the
teardown only stops the engine. With docker already running, the plain pytest command is
enough — and without docker at all, the module skips instead of failing.
