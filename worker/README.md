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
```

## Scripts

### QF batch (`qf:batch`)

Reads a CSV of allocataires, calls the API Particulier `quotient_familial` resource for each row, and writes an output CSV enriched with `qf_value`, `qf_eligible` and `qf_error` columns. Runs are resumable: rows already settled (with a `qf_eligible` of `true`/`false`) in an existing output file are not re-queried.

The input CSV must contain at least the `allocataire-nom_naissance` and `allocataire-date_naissance` columns (see `IDENTITY_COLUMNS` in [src/scripts/qf-batch.ts](src/scripts/qf-batch.ts) for the full set of identity columns used to build the API request).

```bash
npm run qf:batch ./src/scripts/qf-batch-workdir/cnaf_2026_qf_batch_input.csv ./src/scripts/qf-batch-workdir/cnaf_2026_qf_batch_output.csv
```

Optional flags:

```bash
npm run qf:batch <input.csv> <output.csv> --threshold 700 --log-every 50
```

- `--threshold`: QF value below which a row is considered eligible (default `700`).
- `--log-every`: log progress every N rows instead of every row (default `1`).

### DLQ (`dlq`)

```bash
pnpm dlq
```

Inspect/manage the BullMQ dead-letter queue. See [src/scripts/dlq.ts](src/scripts/dlq.ts).

### Redis decode (`redis:decode`)

```bash
pnpm redis:decode
```

Decode raw Redis/BullMQ payloads for debugging. See [src/scripts/redis-decode.ts](src/scripts/redis-decode.ts).
