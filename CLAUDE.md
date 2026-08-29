# Project instructions

## General guidelines
- Comments should always be in english
- Code should be self explanatory, make the variable names meaningful, avoid the comments as much as possible (it is a code smell)

## Node version

Before running **any** `node`, `npm`, `npx`, `yarn` or `pnpm` command, switch to the
version pinned in `.nvmrc` (currently `25`). The shell used by tools is
non-interactive, so nvm must be sourced explicitly in the same command:

```bash
source "$NVM_DIR/nvm.sh" && nvm use && <your node command>
```

Run it from the directory containing the relevant `.nvmrc` (repo root, or the
package directory if it has its own).

## Python / `data/` folder

Everything under [data/](data/) — scripts, Jupyter notebooks, `pip install`, linters —
runs inside the virtualenv at `data/.venv` (Python 3.14 — bumped from 3.12 because the
processing machine's OS, Ubuntu 26.04, does not ship 3.12 at all; see
[data/requirements.txt](data/requirements.txt) for the pins validated against 3.14). Never use
the system `python`/`pip`. In a non-interactive shell, activate it in the same command:

```bash
source data/.venv/bin/activate && <your python command>
```

or call the interpreter directly: `data/.venv/bin/python`, `data/.venv/bin/pip`.

Dependencies live in [data/requirements.txt](data/requirements.txt). For notebooks,
select the `data/.venv` kernel rather than the global one.
