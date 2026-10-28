#!/usr/bin/env bash
#
# One-shot run for the CNOUS/MSE boursiers delivered on 2026-10-27: lamp01 export, the
# Python script (cleaning, lamp01 deduplication, codes), lamp01 injection check, /nfs/run drop,
# wait for production's injector, lamp01 injection.
#
#   ./run_cnous_boursiers.sh [--dry-run]
#
# No lock: stop the FranceConnect and Grist/DN crons first, they draw from the same code list
# and drop into the same directory. Production's /nfs/run injector must keep running, this
# run waits for it.
#
# ORDER — as run_grist_dn.sh: lamp01 injection played then rolled back, /nfs/run, production,
# then lamp01 for real. lamp01 never holds a code production does not.
#
# A real run that drops its file writes run/a-reprendre, removed once lamp01 is injected.
# While it exists every real run refuses to start: drawing again would hand the same boursiers
# a second code, lamp01 not knowing them yet.
#
# DRY RUN: codes drawn on a copy of EXISTING_CODES_PATHFILE_2026, lamp01 injection rolled
# back, nothing dropped.
#
# Each run gets run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/: the lamp01 export, the coded CSV,
# deja-en-base.csv and run.log, which holds the script's report.
#
# Variables (data/.env, the caller's environment wins):
#   CNOUS_BOURSIERS_27_10_2026_DIR  folder holding the boursiers_*.csv      (required)
#   EXISTING_CODES_PATHFILE_2026    codes already handed out                 (required)
#   LAMP_DB_PASSWORD                lamp01 database                          (required)
#   LAMP_DB_HOST/PORT/USER/NAME     (defaults 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID                  campaign exercice            (default 5)
#   FC_PROD_DROP_DIR                drop directory               (default /nfs/run)
#   CNOUS_ATTENTE_PROD_MIN          longest wait for production  (default 240)
#   CNOUS_ATTENTE_PAS_S             polling interval, seconds    (default 30)

set -Eeuo pipefail
# The files below carry identities and email addresses.
umask 007

CNOUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$CNOUS_DIR/../../.." && pwd)"
SCRIPT="$CNOUS_DIR/27_10_2026_clean_cnous_boursiers.py"
PYTHON="$DATA_DIR/.venv/bin/python"
LAMP_INJECT="$(dirname "$DATA_DIR")/lamp01/inject_csv.sh"
RUNS_DIR="$CNOUS_DIR/run"
RESUME_MARKER="$RUNS_DIR/a-reprendre"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  '') ;;
  *) die "usage : $0 [--dry-run]" ;;
esac

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$DATA_DIR/${1#./}" ;;
  esac
}

# --- Environment (as run_aah_direct.sh) ----------------------------------------------

CONFIG_VARS=(
  CNOUS_BOURSIERS_27_10_2026_DIR EXISTING_CODES_PATHFILE_2026 FC_EXERCICE_ID FC_PROD_DROP_DIR
  CNOUS_ATTENTE_PROD_MIN CNOUS_ATTENTE_PAS_S
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

FC_PROD_DROP_DIR="${FC_PROD_DROP_DIR:-/nfs/run}"
FC_EXERCICE_ID="${FC_EXERCICE_ID:-5}"
CNOUS_ATTENTE_PROD_MIN="${CNOUS_ATTENTE_PROD_MIN:-240}"
CNOUS_ATTENTE_PAS_S="${CNOUS_ATTENTE_PAS_S:-30}"
export LAMP_DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
export LAMP_DB_PORT="${LAMP_DB_PORT:-55432}"
export LAMP_DB_USER="${LAMP_DB_USER:-u_passsport}"
export LAMP_DB_NAME="${LAMP_DB_NAME:-passsport}"

[[ -n "${CNOUS_BOURSIERS_27_10_2026_DIR:-}" ]] || die "variable d'environnement manquante : CNOUS_BOURSIERS_27_10_2026_DIR"
[[ -n "${EXISTING_CODES_PATHFILE_2026:-}" ]] || die "variable d'environnement manquante : EXISTING_CODES_PATHFILE_2026"
[[ -n "${LAMP_DB_PASSWORD:-}" ]] || die "LAMP_DB_PASSWORD manquant — voir lamp01/README.md"
[[ "$FC_EXERCICE_ID" =~ ^[0-9]+$ ]] || die "FC_EXERCICE_ID invalide : $FC_EXERCICE_ID"
command -v psql >/dev/null || die "psql introuvable"
[[ -x "$PYTHON" ]] || die "virtualenv absent : $PYTHON"
[[ -x "$LAMP_INJECT" ]] || die "injecteur de la base bénéficiaires absent : $LAMP_INJECT"

INPUT_DIR="$(resolve_path "$CNOUS_BOURSIERS_27_10_2026_DIR")"
CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"
[[ -d "$INPUT_DIR" ]] || die "dossier des fichiers boursiers introuvable : $INPUT_DIR"

# --- Preflight -----------------------------------------------------------------------

warn_or_die() {
  if (( DRY_RUN )); then log "ATTENTION : $1 — un passage réel s'arrêterait ici"; else die "$1"; fi
}

if [[ -f "$RESUME_MARKER" ]]; then
  warn_or_die "le passage $(cat "$RESUME_MARKER") a déposé son fichier sans injecter lamp01 — le terminer (voir son run.log), puis supprimer $RESUME_MARKER"
fi

shopt -s nullglob
backlog=("$FC_PROD_DROP_DIR"/beneficiaires-insertion-*.csv "$FC_PROD_DROP_DIR"/.*.csv.partiel)
shopt -u nullglob
if (( ${#backlog[@]} > 0 )); then
  warn_or_die "dépôt précédent non consommé dans $FC_PROD_DROP_DIR : ${backlog[*]}"
fi

# --- Run directory -------------------------------------------------------------------

TS="$(date '+%Y-%m-%dT%H-%M-%S')"
RUN_NAME="$TS"
if (( DRY_RUN )); then RUN_NAME+="-dry-run"; fi
RUN_DIR="$RUNS_DIR/$RUN_NAME"
mkdir -p "$RUN_DIR"

exec > >(tee -a "$RUN_DIR/run.log") 2>&1

LAMP_EXPORT_CSV="$RUN_DIR/lamp01-beneficiaires.csv"
OUTPUT_CSV="$RUN_DIR/cnous-boursiers-27-10-2026.csv"

rows() { echo $(( $(wc -l < "$1") - 1 )); }

log "=== passage boursiers CNOUS du 27/10/2026, dossier $RUN_DIR"
if (( DRY_RUN )); then
  log "=== DRY-RUN : codes tirés sur une copie, injection lamp01 annulée, aucun dépôt"
fi

# --- 1: lamp01 export ----------------------------------------------------------------

log "étape 1/6 — export de la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
# \copy is a psql meta-command: it ends at the first line break.
export_query="select id_psp, nom, prenom, date_naissance, genre, organisme, allocataire_matricule, allocataire_courriel from beneficiaires where exercice_id = $FC_EXERCICE_ID"
PGPASSWORD="$LAMP_DB_PASSWORD" psql -h "$LAMP_DB_HOST" -p "$LAMP_DB_PORT" -U "$LAMP_DB_USER" \
  -d "$LAMP_DB_NAME" -v ON_ERROR_STOP=1 \
  -c "\copy ($export_query) to '$LAMP_EXPORT_CSV' with (format csv, header true, delimiter ';')"
log "$(rows "$LAMP_EXPORT_CSV") bénéficiaire(s) exporté(s)"

# --- 2: script -----------------------------------------------------------------------

codes_memory="$CODES_CSV"
if (( DRY_RUN )); then
  codes_memory="$RUN_DIR/existing-codes-dry-run.csv"
  if [[ -f "$CODES_CSV" ]]; then cp "$CODES_CSV" "$codes_memory"; fi
fi

log "étape 2/6 — script : nettoyage, dédoublonnage, codes -> $OUTPUT_CSV"
CNOUS_BOURSIERS_27_10_2026_DIR="$INPUT_DIR" \
LAMP_BENEFICIAIRES_EXPORT_PATHFILE_2026="$LAMP_EXPORT_CSV" \
DB_CNOUS_EXPORT_27_10_2026="$OUTPUT_CSV" \
EXISTING_CODES_PATHFILE_2026="$codes_memory" \
  "$PYTHON" "$SCRIPT"

if (( DRY_RUN )); then rm -f "$codes_memory"; fi

nb_codes="$(rows "$OUTPUT_CSV")"
log "$nb_codes code(s) tiré(s)"
if (( nb_codes == 0 )); then
  log "=== rien à déposer"
  exit 0
fi

# --- 3: lamp01, rolled back ----------------------------------------------------------

log "étape 3/6 — contrôle de l'injection dans lamp01, jouée puis annulée"
"$LAMP_INJECT" --dry-run --port "$LAMP_DB_PORT" "$OUTPUT_CSV" \
  || die "injection lamp01 refusée — rien n'est déposé"

nom_depose="beneficiaires-insertion-$nb_codes-$TS.csv"
depose="$FC_PROD_DROP_DIR/$nom_depose"

if (( DRY_RUN )); then
  if [[ ! -d "$FC_PROD_DROP_DIR" || ! -w "$FC_PROD_DROP_DIR" ]]; then
    log "ATTENTION : dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — un passage réel échouerait ici"
  fi
  log "=== dry-run : un passage réel déposerait $depose, attendrait la production puis injecterait lamp01"
  exit 0
fi

# --- 4: /nfs/run ---------------------------------------------------------------------
# From here on, production may take the codes: a failure is finished by hand, never replayed.

log "étape 4/6 — dépôt du CSV de production -> $depose"
temporaire="$FC_PROD_DROP_DIR/.$nom_depose.partiel"
[[ -d "$FC_PROD_DROP_DIR" && -w "$FC_PROD_DROP_DIR" ]] \
  || die "dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — rien n'est déposé"

printf '%s\n' "$RUN_DIR" >"$RESUME_MARKER"
not_dropped="rien n'est déposé : supprimer $temporaire s'il existe et $RESUME_MARKER, puis relancer"
cp "$OUTPUT_CSV" "$temporaire" || die "copie impossible — $not_dropped"
[[ "$(wc -c < "$temporaire")" == "$(wc -c < "$OUTPUT_CSV")" ]] || die "copie incomplète — $not_dropped"
chmod 640 "$temporaire" || die "$not_dropped"
mv "$temporaire" "$depose" || die "$not_dropped"
log "déposé ($nb_codes bénéficiaire(s))"

# --- 5: production (as run_grist_dn.sh) ----------------------------------------------

lamp_replay="$LAMP_INJECT --port $LAMP_DB_PORT $OUTPUT_CSV && rm $RESUME_MARKER"

filed_drop() {
  for path in "$1/${2%.csv}/$2" "$1/$2"; do
    if [[ -e "$path" ]]; then printf '%s\n' "$path"; return 0; fi
  done
  return 1
}

log "étape 5/6 — attente de l'injection en production (au plus $CNOUS_ATTENTE_PROD_MIN min)"
fin=$(( SECONDS + CNOUS_ATTENTE_PROD_MIN * 60 ))
until rangement="$(filed_drop "$FC_PROD_DROP_DIR/succes" "$nom_depose")"; do
  if rangement="$(filed_drop "$FC_PROD_DROP_DIR/failed" "$nom_depose")"; then
    die "$nom_depose refusé par l'injecteur de production ($rangement) : rien dans lamp01. Lire son log : si la préproduction l'a pris, reprise à la main ; sinon corriger, supprimer $RESUME_MARKER et relancer"
  fi
  (( SECONDS < fin )) \
    || die "$nom_depose toujours pas rangé au bout de $CNOUS_ATTENTE_PROD_MIN min — une fois dans $FC_PROD_DROP_DIR/succes/ : $lamp_replay"
  sleep "$CNOUS_ATTENTE_PAS_S"
done
log "injecté en production : $rangement"

# --- 6: lamp01 -----------------------------------------------------------------------

log "étape 6/6 — injection dans lamp01 ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
"$LAMP_INJECT" --port "$LAMP_DB_PORT" "$OUTPUT_CSV" \
  || die "injection lamp01 refusée alors que la production détient les codes — corriger, puis : $lamp_replay"
rm -f "$RESUME_MARKER"

log "=== $nb_codes code(s) en production ($nom_depose) et dans lamp01"
