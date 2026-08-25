#!/usr/bin/env bash
#
# Local dev only. Empties the three data tables in the compose `db` service.
# Schema, views, the site_readonly role and the drizzle migration journal are untouched.
set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/compose.yml"

docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -q -v ON_ERROR_STOP=1 -U passsport -d passsport -c \
  'TRUNCATE audit, eligibility_history, eligibility_results RESTART IDENTITY CASCADE;'

echo "db-reset: tables truncated"
