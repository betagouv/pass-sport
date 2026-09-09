# pass-sport-worker

Background worker for pass-sport: queue processing (BullMQ), eligibility checks, emailing, and one-off data scripts.

## Setup

```bash
nvm use
pnpm install
cp .env.example .env.local
```

## Development

```bash
pnpm dev      # run the worker with tsx watch
pnpm build    # compile to dist/
pnpm start    # run the compiled worker
pnpm test     # typecheck + vitest
```

## Database

```bash
pnpm db:generate  # generate a drizzle migration
pnpm db:migrate   # apply migrations
pnpm db:reset     # empty the local dev tables (schema and migrations untouched)
```

`db:reset` truncates `audit`, `eligibility_history`, `eligibility_results` and `email_verifications` in the compose `db` service. Prefer it over `docker compose down -v`, which also removes the `node_modules` and pnpm store volumes and turns a data wipe into a full dependency reinstall.

## Scripts

### QF batch (`qf:batch`)

Reads a CSV of allocataires, calls the API Particulier `quotient_familial` resource for each row, and writes an output CSV enriched with `qf_value`, `qf_status` and `qf_error` columns. No eligibility verdict is computed: `qf_value` carries the QF returned by the API, and comparing it to a threshold is left to the consumer. Runs are resumable: rows already settled (with a `qf_status` of `trouve`/`non_trouve`) in an existing output file are not re-queried.

The input CSV must contain at least the `allocataire-nom_naissance` and `allocataire-date_naissance` columns (see `IDENTITY_COLUMNS` in [src/scripts/qf-batch.ts](src/scripts/qf-batch.ts) for the full set of identity columns used to build the API request).

```bash
npm run qf:batch ./src/scripts/qf-batch-workdir/cnaf_2026_qf_batch_input.csv ./src/scripts/qf-batch-workdir/cnaf_2026_qf_batch_output.csv
```

Optional flags:

```bash
npm run qf:batch <input.csv> <output.csv> --log-every 50
```

- `--log-every`: log progress every N rows instead of every row (default `1`).

#### On the processing machine

A run can take up to a week, so on the processing machine it goes through
[src/scripts/run-qf-batch.sh](src/scripts/run-qf-batch.sh) instead of a raw `npm run`: it
takes the partner name alone, derives both paths from the shared
`data/2026/partners/qf-batch-workdir` convention, and relies on Node being an apt/NodeSource
package (see [deploy/ansible/lamp-setup.yml](../deploy/ansible/lamp-setup.yml)), already on the
default PATH systemd and interactive shells both use — no per-run sourcing needed. It is the
single entry point, by hand or under systemd — the two must never diverge:

```bash
./src/scripts/run-qf-batch.sh msa
# or, supervised (survives an SSH disconnect, restarts on failure, caps retries):
systemctl start pass-sport-qf-batch@msa
journalctl -fu pass-sport-qf-batch@msa
```

The `pass-sport-qf-batch@` systemd unit is deployed by [deploy/ansible/](../deploy/ansible/)
but never enabled or auto-started — each partner's run is started by hand. See
[deploy/ansible/README.md](../deploy/ansible/README.md) for provisioning the machine.

### LCA pending checks (`lca:checks:enqueue`)

Closes the loop the FranceConnect pipeline opens. That pipeline
([data/2026/partners/franceconnect/](../data/2026/partners/franceconnect/)) mints a pass Sport code
for every `eligible_pending` beneficiary, marks them `eligible_pending_lca`, and drops a CSV for
injection into the LCA base. Until that injection lands, the site shows "en cours de traitement" and
deliberately hides the code.

The `eligible_pending_lca_checks` job is what notices it landed: for every row still carrying
`eligible_pending_lca` it replays LCA `/search` then `/confirm`, and when the confirm answers the
code we stored it flips the verdict to `eligible_confirmed` — which is what lets
`BeneficiaryRecap` show the code and the PDF route serve the attestation. It sends no email.

This script only enqueues; the pass itself runs in the worker
([src/jobs/lca-checks.ts](src/jobs/lca-checks.ts)).

```bash
pnpm lca:checks:enqueue                      # a nominal pass: every eligible row
pnpm lca:checks:enqueue --dry-run --limit 5   # essai à blanc, no verdict moved
```

The job id is constant, so a second enqueue while a pass is queued or running is ignored rather
than stacked, and the script exits 0 — that is the nominal case of a frequent cron.

Configuration, all optional, on the worker app:

| var | default | role |
|---|---|---|
| `LCA_PENDING_CHECK_INSEE_CODE` | `99999` | the fictional commune `/search` is given, no row carrying a real one ([src/lca/insee.ts](src/lca/insee.ts)) |
| `LCA_CHECKS_COOLDOWN_MIN` | `60` | minimum delay before a row is asked about again — what actually paces the load on LCA |
| `LCA_CHECKS_MAX_ATTEMPTS` | `200` | rows past this are abandoned (≈ 8 days at the default cooldown) |
| `LCA_CHECKS_MAX_DURATION_MIN` | `20` | wall-clock stop, to keep under the cron interval |
| `LCA_CHECKS_MAX_CANDIDATES` | `3` | how many records a multi-result `/search` is confirmed against |
| `LCA_CHECKS_DRY_RUN` | off | `1` plays both calls and journals them without moving a verdict |

`LCA_API_URL` and `LCA_API_KEY` are required for a real pass. Locally, `LCA_MODE=mock` with
`LCA_MOCK_CONFIRM_CODE` set to a seeded row's code exercises the happy path with no network.

#### On the processing machine

The cron goes through [src/scripts/run-lca-checks.sh](src/scripts/run-lca-checks.sh), which opens a
Scalingo Redis tunnel (`scalingo db-tunnel SCALINGO_REDIS_URL`, port 10001) and runs the enqueuer
against it. It reads `/etc/default/pass-sport-fc` like
[run_fc_pipeline.sh](../data/2026/partners/franceconnect/run_fc_pipeline.sh), and holds a `flock`
so a stuck tunnel cannot pile up SSH sessions.

```bash
SCALINGO_APP=<app> ./src/scripts/run-lca-checks.sh
SCALINGO_APP=<app> ./src/scripts/run-lca-checks.sh --dry-run --limit 5
```

The `pass-sport-lca-checks` crontab entry is deployed by [deploy/ansible/](../deploy/ansible/) but
posted DISABLED, and its schedule is a playbook variable — see
[deploy/ansible/README.md](../deploy/ansible/README.md).

Reading a pass back, through the tunnel:

```sql
select action, status, count(*)
  from eligibility_history
 where action like 'lca.pending_check.%' or action like 'lca_checks.%'
 group by 1, 2 order by 1;
```

Rows LCA never ended up serving:

```sql
select count(*) from eligibility_results
 where verdict = 'eligible_pending_lca' and lca_check_attempts >= 200;
```
