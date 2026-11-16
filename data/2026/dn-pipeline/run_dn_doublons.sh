#!/usr/bin/env bash
#
# Flags the Démarches Numériques dossiers en construction lamp01 may already know: the codes
# found in a private annotation, then a label. See dn_doublons.py.
#
#   ./run_dn_doublons.sh [--dry-run]
#
# Hourly cron. It only reads lamp01 and writes to dossiers en construction: no code drawn, no
# drop in /nfs/run, no Scalingo tunnel, so neither FC_LOCK_FILE nor a pause during the other
# crons. A run still going makes the next one skip, exit 0.
#
# One directory per run, doublons/<YYYY-MM-DDTHH-MM-SS>[-dry-run]/ as run_dn.sh, keeps run.log
# and the journal. Only a dry run's journal holds identities.
#
# Variables (data/.env, the caller's environment wins):
#   DN_API_URL (optional), DN_API_TOKEN, DN_DEMARCHE_NUMBER
#   LAMP_DB_PASSWORD             lamp01 database                           (required)
#   LAMP_DB_HOST/PORT/USER/NAME  (defaults 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID               campaign exercice       (default 5)
#   DN_RUN_DIR                   run directories         (default <this dir>/run)
#   DN_DOSSIERS                  only these dossier numbers, comma separated (rehearsals only)

set -Eeuo pipefail
umask 007

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$PIPELINE_DIR/../.." && pwd)"
PYTHON="$DATA_DIR/.venv/bin/python"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) die "argument inconnu : $arg — usage : $0 [--dry-run]" ;;
  esac
done

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$DATA_DIR/${1#./}" ;;
  esac
}

CONFIG_VARS=(
  DN_API_URL DN_API_TOKEN DN_DEMARCHE_NUMBER DN_RUN_DIR DN_DOSSIERS FC_EXERCICE_ID
  LAMP_DB_HOST LAMP_DB_PORT LAMP_DB_USER LAMP_DB_NAME LAMP_DB_PASSWORD
)

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

export FC_EXERCICE_ID="${FC_EXERCICE_ID:-5}"
export LAMP_DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
export LAMP_DB_PORT="${LAMP_DB_PORT:-55432}"
export LAMP_DB_USER="${LAMP_DB_USER:-u_passsport}"
export LAMP_DB_NAME="${LAMP_DB_NAME:-passsport}"

WORK_DIR="$(resolve_path "${DN_RUN_DIR:-$PIPELINE_DIR/run}")/doublons"
RUNS_INDEX="$WORK_DIR/passages.log"
mkdir -p "$WORK_DIR"

record_run() {
  printf '%s  %-13s  %3s  %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$1" "$2" "$3" >>"$RUNS_INDEX"
}

exec 9>"$WORK_DIR/verrou"
if ! flock -n 9; then
  record_run ignore-verrou 0 "passage précédent encore en cours"
  exit 0
fi

RUN_DIR="$WORK_DIR/$(date '+%Y-%m-%dT%H-%M-%S')"
if (( DRY_RUN )); then RUN_DIR+="-dry-run"; fi
mkdir "$RUN_DIR"
exec > >(tee "$RUN_DIR/run.log" 9>&-) 2>&1

on_exit() {
  local exit_code=$?
  if (( exit_code == 0 )); then
    record_run succes 0 "$RUN_DIR"
  else
    record_run echec "$exit_code" "$RUN_DIR"
    log "=== statut : echec — $RUNS_INDEX"
  fi
}
trap on_exit EXIT

[[ -x "$PYTHON" ]] || die "virtualenv absent : $PYTHON"
[[ -n "${LAMP_DB_PASSWORD:-}" ]] || die "LAMP_DB_PASSWORD manquant — voir lamp01/README.md"
command -v psql >/dev/null || die "psql introuvable"

log "=== dossiers en construction, base $LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT"
doublons_args=(--journal "$RUN_DIR/doublons.csv")
if (( DRY_RUN )); then
  log "=== DRY-RUN : lecture de DN et de lamp01 seulement, aucune écriture DN"
  doublons_args+=(--dry-run)
fi
if [[ -n "${DN_DOSSIERS:-}" ]]; then
  log "ATTENTION : seuls les dossiers DN_DOSSIERS=$DN_DOSSIERS sont pris"
fi

"$PYTHON" "$PIPELINE_DIR/dn_doublons.py" "${doublons_args[@]}"
