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

`db:reset` truncates `audit`, `eligibility_history`, `eligibility_results` and `fc_dn_dossiers` in the compose `db` service. Prefer it over `docker compose down -v`, which also removes the `node_modules` and pnpm store volumes and turns a data wipe into a full dependency reinstall.

## Cadence API Particulier

Every online API Particulier call — the `france-connect` chain, and only it — passes through a
fixed-window rate gate before it goes out
([src/eligibility/rate-gate.ts](src/eligibility/rate-gate.ts)). Two windows, both aligned on the
wall clock, both enforced in Redis so the ceiling holds across processes rather than per worker
instance:

- **20 appels/seconde**, day and night;
- **300 appels/minute** between 8h and 21h Paris, **500** from 21h to 8h.

When a window is full, the queue is paused until it rolls over and the job is requeued **without**
consuming an attempt — the same mechanism the 429 path uses, so the chain resumes at its checkpoint
and no answered call is billed twice. The pause is journalled in `eligibility_history` as a
`rate_gate` / `rate_limited` row naming the window that blocked. A gate that cannot reach Redis
pauses too: a burst sent blind is exactly what the ceiling exists to prevent.

Redis keys — the counters expire on their own, the ceilings do not:

| Clé | Rôle |
|---|---|
| `apip:rate:s:<seconde>` | compteur de la seconde en cours (TTL 2 s) |
| `apip:rate:m:<minute>` | compteur de la minute en cours (TTL 120 s) |
| `apip:rate:config:per_second` | plafond appels/seconde |
| `apip:rate:config:per_minute_day` | plafond appels/minute, 8h-21h Paris |
| `apip:rate:config:per_minute_night` | plafond appels/minute, 21h-8h Paris |

The ceilings are re-read on **every** call, so they are retuned on a running worker with no
redeploy and no restart:

```bash
pnpm apip:rate                                        # état des 3 plafonds, * = appliqué maintenant
pnpm apip:rate --per-second 10
pnpm apip:rate --per-minute-day 250 --per-minute-night 450
pnpm apip:rate --reset                                # retour aux replis
```

`API_PARTICULIER_MAX_CALLS_PER_SECOND`, `API_PARTICULIER_MAX_CALLS_PER_MINUTE` and
`API_PARTICULIER_MAX_CALLS_PER_MINUTE_NIGHT` are **fallbacks only**, used when the matching Redis
key is absent or carries an unusable value (non-numeric, or below 1). A typo in a ceiling therefore
can neither stop the chain nor lift the ceiling. Every change of the applied ceilings is logged by
the worker.

### Sonde (`apip:rate:probe`)

Rejoue un appel API Particulier déjà passé — la ligne la plus récente d'`eligibility_history` qui
porte son `body_payload`, ou celle que `--id` désigne — autant de fois que demandé, à travers le
cadenceur. C'est le seul moyen de voir la cadence tenir sur du trafic réel : les tests e2e tournent
contre un client factice, aucun octet ne part sur le réseau.

```bash
pnpm apip:rate:probe --calls 20
```

L'identité pivot est reconstruite depuis le payload enregistré puis **recomparée** à celui-ci avant
le premier appel : si les deux diffèrent, la sonde s'arrête sans rien appeler plutôt que de mesurer
la cadence d'un autre appel que celui qu'on croit rejouer. Rien n'est écrit en base, aucune clé
`apip:rate:config:*` n'est touchée — seuls les compteurs bougent, et ils sont partagés avec le
worker : une sonde lancée pendant qu'il tourne lui prend du quota.

Sur un refus, la sonde dort jusqu'à la fin de la fenêtre bloquante ; le worker, lui, met la queue en
pause et requeue le job. Même plafond, deux façons d'attendre.

The offline `qf:batch` runs on the processing machine with its own in-memory pacer
([src/scripts/rate-pacer.ts](src/scripts/rate-pacer.ts)) and does **not** consume these counters.

## Dossier Démarche Numérique pré-rempli

A FranceConnect household with at least one `not_eligible` beneficiary gets a « Vous pensez être
éligible ? » button on the site. The click asks this worker for a dossier on the support démarche
that the [DN pipeline](../data/2026/dn-pipeline/) processes, through its own queue
`codes-queue-dn-dossiers` (never behind the FranceConnect backlog). The job
([src/jobs/fc-dn-dossier.ts](src/jobs/fc-dn-dossier.ts)):

1. looks up the user's live dossier on DN by its prefill token. If DN still lists it, the job
   updates its state and stops there: one dossier per FranceConnect user and démarche;
2. if DN no longer lists it, the row is set to `gone`. Otherwise, with no dossier yet, it rebuilds
   the household from the API Particulier answers already in `eligibility_history`. It never
   calls API Particulier;
3. pre-fills a new dossier through DN's public prefill API (`POST
   /api/public/v1/demarches/<n>/dossiers`, no authentication) and stores it in `fc_dn_dossiers`.
   The site reads that table through the `fc_dn_dossier_by_sub` view.

What goes in the dossier is
[src/demarche-numerique/prefill.ts](src/demarche-numerique/prefill.ts):
- the FranceConnect identity;
- the caisse from the quotient answer (no API answer carries an address: the usager types it);
- the children a campaign window could carry and the last run refused;
- the AEEH answer for each child;
- the foyer and children questions.

A « non » is only sent when an answer says so: the DN pipeline grants on these answers. The values sent
are journaled as `dn.dossier_prefill` (`body_payload`), and state lookups as `dn.dossier_etat`.
With `HISTORY_PAYLOAD=0` the journal holds no API data, and the dossier carries the FranceConnect
identity alone.

The dossier URL carries a bearer token: until the dossier is claimed, whoever opens it takes it,
along with the data pre-filled in it. It is stored in `fc_dn_dossiers` and nowhere else. It is
never logged or journaled, and Sentry spans and breadcrumbs skip it
([src/sentry-scrub.ts](src/sentry-scrub.ts)).

| var | default | role |
|---|---|---|
| `DN_DEMARCHE_NUMBER` | none | the démarche to pre-fill; unset, or without champ ids, every dossier job fails and the rest of the worker runs on |
| `DN_BASE_URL` | `https://demarche.numerique.gouv.fr` | DN instance |
| `DN_REQUEST_TIMEOUT_MS` | `8000` | per call to DN |

The champ ids live in
[src/demarche-numerique/champs.ts](src/demarche-numerique/champs.ts), one entry per démarche.
DN silently drops a value sent under an unknown id or outside a champ's options. Rerun the check
after every change to the démarche:

```bash
pnpm dn:champs 159278    # reads DN_API_TOKEN from the environment or ../data/.env
```

The script lists the démarche's champs and resolves them by the labels the DN pipeline reads them by
(`mapping.py`). It prints the entry `champs.ts` must hold, and exits 1 when that entry differs or
a champ cannot be resolved. The token stays on the machine that runs it: the prefill API needs
none, and it never goes on Scalingo.

Finding someone's dossier, through the tunnel:

```sql
select dossier_number, state, submitted_at, created_at, updated_at
  from fc_dn_dossiers where allocataire_fc_sub = '<sub>' order by created_at;
```

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

### FC code emails (`fc:code-emails:enqueue`)

Mails their code to the FranceConnect beneficiaries. The FranceConnect pipeline
([data/2026/partners/franceconnect/](../data/2026/partners/franceconnect/)) sets every row it serves
to `eligible_confirmed` with its code — a code found in the lamp beneficiary database
(`writeback_confirmed.sql`) or a freshly minted one (`writeback_verdict.sql`) — which is what lets
`BeneficiaryRecap` show the code and the PDF route serve the attestation straight away.

The `fc_code_emails` job sweeps every FranceConnect row sitting at `eligible_confirmed` with a code
and no `email_kind` and sends the template its `situation` names. `email_kind is null` is what
restricts it to the FranceConnect path: the parcours hors FranceConnect names its template at insert
time and mails inline.

Sending once is the whole difficulty, since the pass runs after every pipeline run over a table that
keeps what it has already served. `email_attempts` is incremented **before** the POST, not after:
Link Mobility answers a verdict in three of its four outcomes — accepted, rejected, HTTP error — and
the row is marked from that answer, but the fourth (a timeout, a severed socket, a worker killed
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
([src/jobs/fc-code-emails.ts](src/jobs/fc-code-emails.ts)).

```bash
pnpm fc:code-emails:enqueue                      # a nominal pass: every row awaiting its mail
pnpm fc:code-emails:enqueue --dry-run --limit 5   # essai à blanc, nothing sent
```

The job id is constant, so a second enqueue while a pass is queued or running is ignored rather
than stacked, and the script exits 0.

Configuration, all optional, on the worker app:

| var | default | role |
|---|---|---|
| `FC_CODE_EMAIL_MAX_DURATION_MIN` | `20` | wall-clock stop, to keep under the interval between two pipeline runs |
| `FC_CODE_EMAIL_DRY_RUN` | off | `1` selects and journals the rows without sending anything |
| `FC_CODE_EMAIL_MAX_ATTEMPTS` | `3` | code mails per row before it is abandoned — each attempt risks a duplicate for a real recipient |
| `FC_CODE_EMAIL_COOLDOWN_MIN` | `60` | minimum delay before a failed code mail is retried |
| `FC_CODE_EMAIL_DELAY_MIN` | `30` | how far out the code mail is programmed on Link Mobility; `0` sends it on the spot |

#### On the processing machine

There is no cron of its own: [run_fc_pipeline.sh](../data/2026/partners/franceconnect/run_fc_pipeline.sh)
enqueues the job at the end of every successful run — even one with nobody new to serve, since the
pass also retries the failed mails. It opens a second Scalingo tunnel for that, to Redis
(`scalingo db-tunnel SCALINGO_REDIS_URL`, port `FC_REDIS_TUNNEL_PORT`, 10001 by default), and runs
the enqueuer against it with `FC_CODE_EMAILS_REDIS_URL`. `FC_CODE_EMAILS_DRY_RUN=1` on the pipeline
enqueues a dry-run pass.

Reading a pass back, through the tunnel:

```sql
select action, status, count(*)
  from eligibility_history
 where action like 'fc_code_emails.%' or action like 'email.code_%'
 group by 1, 2 order by 1;
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
