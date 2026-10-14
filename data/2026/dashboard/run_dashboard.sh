#!/usr/bin/env bash
#
# Loads today's LCA dashboard extraction, dropped on the NFS by the LCA host (specs/dashboard/),
# into the site database on Scalingo, which the public page /tableau-de-bord reads.
#
#   crontab -e
#   15 7 * * * /path/to/data/2026/dashboard/run_dashboard.sh
#
# Exit 0 means loaded. Any other exit is an anomaly cron mails the log of, a missing extraction
# for today included. Rerunning is harmless: each load replaces the whole table.
#
# DRY RUN: `run_dashboard.sh --dry-run` runs the load to the end of its transaction,
# checks included, then rolls it back.
#
# Every run logs into TDB_RUN_DIR/<YYYY-MM-DDTHH-MM-SS>/run.log and appends one line to
# TDB_RUN_DIR/passages.log (latest and derniere-erreur point to the relevant run).
#
# Variables read from data/.env, the environment winning over it:
#   SCALINGO_APP           app hosting the database                 (required)
#   SCALINGO_API_TOKEN     API token, for a non-interactive `scalingo`
#   SCALINGO_SSH_IDENTITY  SSH private key for db-tunnel             (optional)
#   TDB_DROP_DIR           drop directory of the LCA host's export   (default /nfs/stats)
#   TDB_TUNNEL_PORT        local Postgres tunnel port                (default 10002, apart from
#                          the FranceConnect cron's 10000/10001 so both can run at once)
#   TDB_RUN_DIR            run directories                           (default <this dir>/run)
#   TDB_LOCK_FILE          overlap lock                              (default /tmp/pass-sport-tdb.lock)

set -Eeuo pipefail
umask 027
# The extraction names and "today" are both Paris wall clock.
export TZ=Europe/Paris

TDB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$TDB_DIR/../.." && pwd)"
TABLEAUX=(genre situation organisme region departement age federation)
CSV_HEADER='tableau;jour;code;libelle;eligibles;codes_actives;codes_actives_du_jour;taux_recours;part_eligibles;part_actives'

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { RUN_ERROR="$*"; log "ERREUR : $*" >&2; exit 1; }

# open_tunnel, close_tunnels, tunnel_database_url
# shellcheck source=../../utils/scalingo_tunnel.sh
. "$DATA_DIR/utils/scalingo_tunnel.sh"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) die "argument inconnu : $arg — usage : $0 [--dry-run]" ;;
  esac
done

# --- Configuration ------------------------------------------------------------------

CONFIG_VARS=(
  SCALINGO_APP SCALINGO_API_TOKEN SCALINGO_SSH_IDENTITY
  TDB_DROP_DIR TDB_TUNNEL_PORT TDB_RUN_DIR TDB_LOCK_FILE
)

# What the caller exported wins over data/.env, so a trial run can divert the drop directory:
# `TDB_DROP_DIR=/tmp/stats ./run_dashboard.sh --dry-run`.
declare -A caller_env=()
for var in "${CONFIG_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then caller_env["$var"]="${!var}"; fi
done

if [[ -f "$DATA_DIR/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$DATA_DIR/.env"
  set +a
fi

for var in "${!caller_env[@]}"; do
  printf -v "$var" '%s' "${caller_env[$var]}"
  export "${var?}"
done

TDB_DROP_DIR="${TDB_DROP_DIR:-/nfs/stats}"
TDB_TUNNEL_PORT="${TDB_TUNNEL_PORT:-10002}"
TDB_RUN_DIR="${TDB_RUN_DIR:-$TDB_DIR/run}"
TDB_LOCK_FILE="${TDB_LOCK_FILE:-/tmp/pass-sport-tdb.lock}"

# --- Run bookkeeping ----------------------------------------------------------------

RUN_NAME="$(date '+%Y-%m-%dT%H-%M-%S')"
if (( DRY_RUN )); then RUN_NAME+="-dry-run"; fi
RUNS_INDEX="$TDB_RUN_DIR/passages.log"
mkdir -p "$TDB_RUN_DIR"

record_run() {
  local status="$1" exit_code="$2" summary="${3//$'\n'/ }" line
  printf -v line '%s  %-13s  %3s  %s' "$RUN_NAME" "$status" "$exit_code" "$summary"
  printf '%s\n' "$line" >>"$RUNS_INDEX"
  if [[ -n "${RUN_DIR:-}" ]]; then printf '%s\n' "$line" >"$RUN_DIR/STATUT"; fi
}

exec 9>"$TDB_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage est déjà en cours ($TDB_LOCK_FILE) — abandon"
  record_run ignore-verrou 0 "un autre passage est déjà en cours"
  exit 0
fi

RUN_DIR="$TDB_RUN_DIR/$RUN_NAME"
mkdir "$RUN_DIR"
ln -sfn "$RUN_NAME" "$TDB_RUN_DIR/latest"

LOG_FILE="$RUN_DIR/run.log"
# 9>&- : tee briefly outlives the script and must not carry the lock away with it.
exec > >(tee -a "$LOG_FILE" 9>&-) 2>&1

RUN_DETAIL=""
RUN_ERROR=""

on_exit() {
  local exit_code=$?
  close_tunnels
  if (( exit_code == 0 )); then
    record_run succes 0 "$RUN_DETAIL"
    log "=== statut : succes"
    return
  fi
  record_run echec "$exit_code" "${RUN_ERROR:-sortie en erreur}"
  ln -sfn "$RUN_NAME" "$TDB_RUN_DIR/derniere-erreur"
  log "=== statut : echec — $RUNS_INDEX"
}

trap 'RUN_ERROR="${RUN_ERROR:-échec (code $?) ligne $LINENO : $BASH_COMMAND}"' ERR
trap on_exit EXIT

log "=== tableau de bord LCA, dossier $RUN_DIR"
if (( DRY_RUN )); then log "=== DRY-RUN : chargement annulé en fin de transaction"; fi

[[ -n "${SCALINGO_APP:-}" ]] || die "variable d'environnement manquante : SCALINGO_APP"
command -v psql >/dev/null     || die "psql introuvable"
command -v scalingo >/dev/null || die "scalingo introuvable"

# --- Today's extraction -------------------------------------------------------------

# ls, not test -d: NFSv4 ACLs make access() checks lie (see deploy/ansible/tasks/config.yml).
ls "$TDB_DROP_DIR" >/dev/null || die "dossier de dépôt illisible : $TDB_DROP_DIR"

shopt -s nullglob
extractions=("$TDB_DROP_DIR"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]-[0-9][0-9]-[0-9][0-9])
shopt -u nullglob
(( ${#extractions[@]} )) || die "aucune extraction dans $TDB_DROP_DIR"

EXTRACTION_DIR="$(printf '%s\n' "${extractions[@]}" | LC_ALL=C sort | tail -n 1)"
EXTRACTION="$(basename "$EXTRACTION_DIR")"
[[ "$EXTRACTION" == "$(date '+%Y-%m-%d')T"* ]] \
  || die "rien n'a été déposé aujourd'hui : l'extraction la plus récente est $EXTRACTION"
log "extraction $EXTRACTION_DIR"

for tableau in "${TABLEAUX[@]}"; do
  file="$EXTRACTION_DIR/$tableau.csv"
  header=""
  IFS= read -r header <"$file" || die "fichier illisible ou vide : $file"
  [[ "$header" == "$CSV_HEADER" ]] || die "en-tête inattendu dans $tableau.csv : $header"
done

# --- Load ---------------------------------------------------------------------------

open_tunnel SCALINGO_POSTGRESQL_URL "$TDB_TUNNEL_PORT"
tunnel_database_url "$TDB_TUNNEL_PORT" TDB_DATABASE_URL

psql_args=(-X -v ON_ERROR_STOP=1 -v extraction="$EXTRACTION")
if (( DRY_RUN )); then psql_args+=(-v dry_run=1); fi

# From the extraction directory: \copy reads the CSV files by fixed, relative names.
(cd "$EXTRACTION_DIR" && psql "$TDB_DATABASE_URL" "${psql_args[@]}" -f "$TDB_DIR/load_dashboard.sql")

if (( DRY_RUN )); then
  RUN_DETAIL="extraction $EXTRACTION valide — rien d'écrit"
else
  RUN_DETAIL="extraction $EXTRACTION chargée"
fi
