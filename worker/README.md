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
`BeneficiaryRecap` show the code and the PDF route serve the attestation.

A second pass then mails that code. It sweeps every FranceConnect row sitting at
`eligible_confirmed` with a code and no `email_kind` — from either route, the loop above or the
rapprochement with the lamp beneficiary database (`writeback_confirmed.sql`) — and sends the
template its `situation` names. `email_kind is null` is what restricts it to the FranceConnect
path: the parcours hors FranceConnect names its template at insert time and mails inline.

Sending once is the whole difficulty, since the pass runs every 30 minutes over a table that keeps
what it has already served. `email_attempts` is incremented **before** the POST, not after: Link
Mobility answers a verdict in three of its four outcomes — accepted, rejected, HTTP error — and the
row is marked from that answer, but the fourth (a timeout, a severed socket, a worker killed
mid-POST) leaves nothing to read. That counter is what bounds the resends in the only case where
nothing else can.

That mail is not sent on the spot: it is handed to Link Mobility as a campagne programmée
(`date` on `/api/envoyer/e-mail`, a UNIX timestamp) `FC_CODE_EMAIL_DELAY_MIN` minutes out, 30 by
default. Link Mobility answers `{resultat: 1, id}` the moment it accepts the schedule, so what the
row records is the acceptance: `email_sent_at` dates that, and the `scheduled_for` of the
`email.code_*` history entry dates the diffusion. Until it goes out the campaign sits at `statut 0`
and can still be moved (`/api/campaign/edit`) or cancelled (`/api/campaign/delete`) with the
returned id.

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
| `FC_CODE_EMAIL_MAX_ATTEMPTS` | `3` | code mails per row before it is abandoned — tighter than the LCA ceiling, each attempt risking a duplicate for a real recipient |
| `FC_CODE_EMAIL_COOLDOWN_MIN` | `60` | minimum delay before a failed code mail is retried |
| `FC_CODE_EMAIL_DELAY_MIN` | `30` | how far out the code mail is programmed on Link Mobility; `0` sends it on the spot |

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

### Test email (`email:test`)

Sends one real mail through Link Mobility to an address you choose, and exits. It writes nothing to
the database and enqueues nothing: it exercises the template, the merge fields and the programmed
send (`date`) alone. The beneficiary it names is fake — `Test Bénéficiaire`, code
`TEST-CODE-0000`.

```bash
pnpm email:test moi@example.org                            # code_direct_boursier, dans 30 min
pnpm email:test moi@example.org --in 5 --kind code_indirect
pnpm email:test moi@example.org --in 0                     # immédiat
```

- `--in`: minutes before the campaign goes out (default `30`). `0` omits `date` entirely.
- `--kind`: `code_direct_aah`, `code_direct_boursier`, `code_indirect` or `not_eligible_hors_fc`
  (default `code_direct_boursier`).

It reads `.env.local` like the worker does, so it needs `LINK_MOBILITY_API_KEY` — and it hits
whatever `LINK_MOBILITY_API_URL` points at. Left unset, that is the real Link Mobility, and the mail
really leaves. On acceptance it prints the campaign id, which is what `/api/campaign/edit` and
`/api/campaign/delete` take to move or cancel a scheduled send; on a rejection it prints the codes
Link Mobility answered and exits 1.

`expediteur` is not yours to pick: Link Mobility only accepts a sender on a domain referenced on the
account (`info.pass.sports.gouv.fr` here), and anything else is refused with error `17`.
`LINK_MOBILITY_SENDER_EMAIL` and `LINK_MOBILITY_SENDER_NAME` override it within that constraint.
