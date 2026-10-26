#!/usr/bin/env bash
#
# Codes pass Sport for the beneficiaries of the Démarches Numériques dossiers, end to end: DN
# read, lamp01 lookup, code drawing, lamp01 injection check, /nfs/run drop, wait for
# production's injector, lamp01 injection, then, per dossier, the codes annotation, a message
# (the only channel its codes go out by), a label and the acceptance.
#
#   ./run_dn.sh [--dry-run]
#   ./run_dn.sh --reprendre <dossier de passage>
#
# ORDER — /nfs/run, then production, then lamp01, then the feedback: lamp01 never holds a code
# production does not, and nobody hears of a code before production's injector has moved the
# drop to succes/. A drop the injector moves to failed/ is never replayed: its dossiers are
# labelled « À vérifier » without a message and the run ends in error.
#
# A real run that fails once its drop is in /nfs/run leaves run/a-reprendre: every later run
# refuses to start until `--reprendre` has replayed the drop, the wait for production, the
# lamp01 injection and the feedback from that run's own files (markers and journal skip what
# was already done). Removing run/a-reprendre by hand closes a run whose remaining errors were
# handled outside the pipeline.
#
# DRY RUN reads DN (read only) and plays every step without leaving anything outside its run
# directory: codes are drawn on a copy of EXISTING_CODES_PATHFILE_2026, the lamp01 injection is
# rolled back, nothing is dropped nor waited for and no DN write happens (retours.csv lists what
# would have been sent).
#
# Cron friendly: no work, a lock already held or a pending /nfs/run drop end in 0.
#
# Variables (data/.env, the caller's environment wins):
#   DN_API_URL (optional), DN_API_TOKEN, DN_DEMARCHE_NUMBER
#   EXISTING_CODES_PATHFILE_2026 codes already handed out                  (required)
#   LAMP_DB_PASSWORD             lamp01 database                           (required)
#   LAMP_DB_HOST/PORT/USER/NAME  (defaults 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID               campaign exercice       (default 5)
#   FC_PROD_DROP_DIR             drop directory          (default /nfs/run)
#   FC_LOCK_FILE                 lock shared with the FranceConnect cron (default /tmp/pass-sport-fc.lock)
#   DN_ATTENTE_PROD_MIN          longest wait for production (default 120; 0 = no check, rehearsals only)
#   DN_ATTENTE_PAS_S             seconds between two checks (default 30)
#   DN_RUN_DIR                   run directories         (default <this dir>/run)

set -Eeuo pipefail
# The files below carry identities and email addresses.
umask 007

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$PIPELINE_DIR/../.." && pwd)"
FC_DIR="$DATA_DIR/2026/partners/franceconnect"
PYTHON="$DATA_DIR/.venv/bin/python"
PIPELINE="$PIPELINE_DIR/dn_pipeline.py"
FC_PIPELINE="$FC_DIR/fc_pipeline.py"
MATCH_SQL="$PIPELINE_DIR/match_dn.sql"
LAMP_INJECT="$(dirname "$DATA_DIR")/lamp01/inject_csv.sh"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { RUN_ERROR="$*"; log "ERREUR : $*" >&2; exit 1; }

USAGE="usage : $0 [--dry-run] | --reprendre <dossier de passage>"
DRY_RUN=0
RESUME_DIR=""
expect_resume_dir=0
for arg in "$@"; do
  if (( expect_resume_dir )); then RESUME_DIR="$arg"; expect_resume_dir=0; continue; fi
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --reprendre) expect_resume_dir=1 ;;
    *) die "argument inconnu : $arg — $USAGE" ;;
  esac
done
(( expect_resume_dir == 0 )) || die "$USAGE"
if [[ -n "$RESUME_DIR" ]]; then
  (( DRY_RUN == 0 )) || die "--reprendre ne se combine pas avec --dry-run"
  [[ -d "$RESUME_DIR" ]] || die "dossier de passage introuvable : $RESUME_DIR"
  RESUME_DIR="$(cd "$RESUME_DIR" && pwd)"
fi

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$DATA_DIR/${1#./}" ;;
  esac
}

# --- Environment -------------------------------------------------------------------

CONFIG_VARS=(
  DN_API_URL DN_API_TOKEN DN_DEMARCHE_NUMBER
  EXISTING_CODES_PATHFILE_2026 FC_PROD_DROP_DIR FC_LOCK_FILE FC_EXERCICE_ID
  DN_RUN_DIR DN_ATTENTE_PROD_MIN DN_ATTENTE_PAS_S
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
FC_LOCK_FILE="${FC_LOCK_FILE:-/tmp/pass-sport-fc.lock}"
FC_EXERCICE_ID="${FC_EXERCICE_ID:-5}"
DN_RUN_DIR="$(resolve_path "${DN_RUN_DIR:-$PIPELINE_DIR/run}")"
DN_ATTENTE_PROD_MIN="${DN_ATTENTE_PROD_MIN:-120}"
DN_ATTENTE_PAS_S="${DN_ATTENTE_PAS_S:-30}"
# Where production's injector moves a drop once handled.
PROD_SUCCESS_DIR="$FC_PROD_DROP_DIR/succes"
PROD_FAILED_DIR="$FC_PROD_DROP_DIR/failed"

TS_ISO="$(date '+%Y-%m-%dT%H:%M:%S')"
TS_COMPACT="${TS_ISO//:/-}"
RUN_NAME="$TS_COMPACT"
if (( DRY_RUN )); then RUN_NAME+="-dry-run"; fi
if [[ -n "$RESUME_DIR" ]]; then RUN_NAME+="-reprise"; fi

RUNS_INDEX="$DN_RUN_DIR/passages.log"
# Holds the run directory of a real run that stopped after lamp01 was filled.
RESUME_MARKER="$DN_RUN_DIR/a-reprendre"
mkdir -p "$DN_RUN_DIR"

record_run() {
  local status="$1" exit_code="$2" summary="${3//$'\n'/ }" line
  printf -v line '%s  %-17s  %3s  %s' "$RUN_NAME" "$status" "$exit_code" "$summary"
  printf '%s\n' "$line" >>"$RUNS_INDEX"
  if [[ -n "${RUN_DIR:-}" ]]; then printf '%s\n' "$line" >"$RUN_DIR/STATUT"; fi
}

# --- Lock --------------------------------------------------------------------------
# Shared with the FranceConnect cron and run_aah_direct.sh: all draw from
# EXISTING_CODES_PATHFILE_2026 and drop into /nfs/run.

exec 9>"$FC_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage tient le verrou $FC_LOCK_FILE (cron FranceConnect ?) — passage reporté"
  record_run ignore-verrou 0 "verrou $FC_LOCK_FILE déjà pris"
  exit 0
fi

if [[ -f "$RESUME_MARKER" && -z "$RESUME_DIR" ]]; then
  pending_run="$(cat "$RESUME_MARKER")"
  log "ERREUR : le passage $pending_run est inachevé (codes déjà dans lamp01) — à reprendre : $0 --reprendre $pending_run" >&2
  record_run echec 1 "passage inachevé à reprendre : $pending_run"
  exit 1
fi
if [[ -n "$RESUME_DIR" && "$(cat "$RESUME_MARKER" 2>/dev/null)" != "$RESUME_DIR" ]]; then
  log "ERREUR : $RESUME_DIR n'est pas le passage à reprendre ($RESUME_MARKER : $(cat "$RESUME_MARKER" 2>/dev/null || echo absent))" >&2
  exit 1
fi

# --- Run directory -----------------------------------------------------------------

RUN_DIR="${RESUME_DIR:-$DN_RUN_DIR/$RUN_NAME}"
[[ -n "$RESUME_DIR" ]] || mkdir "$RUN_DIR"
ln -sfn "$(basename "$RUN_DIR")" "$DN_RUN_DIR/latest"

exec > >(tee -a "$RUN_DIR/run.log" 9>&-) 2>&1

RUN_STATUS="succes"
RUN_DETAIL=""
RUN_STEP="préparation"
RUN_ERROR=""
DRY_RUN_CODES_COPY=""

step() {
  RUN_STEP="$1"
  log "étape $1 — $2"
}

on_exit() {
  local exit_code=$?
  if [[ -n "$DRY_RUN_CODES_COPY" ]]; then rm -f "$DRY_RUN_CODES_COPY"; fi

  if (( exit_code == 0 )); then
    record_run "$RUN_STATUS" 0 "$RUN_DETAIL"
    log "=== statut : $RUN_STATUS — $RUN_DETAIL"
    return
  fi

  record_run echec "$exit_code" "étape $RUN_STEP — ${RUN_ERROR:-sortie en erreur}"
  ln -sfn "$(basename "$RUN_DIR")" "$DN_RUN_DIR/derniere-erreur"
  if [[ -f "$RESUME_MARKER" ]]; then
    log "=== passage inachevé, à reprendre : $0 --reprendre $(cat "$RESUME_MARKER")"
  fi
  log "=== statut : echec — $RUNS_INDEX"
}

trap 'RUN_ERROR="${RUN_ERROR:-échec (code $?) ligne $LINENO : $BASH_COMMAND}"' ERR
trap on_exit EXIT

DN_RAW="$RUN_DIR/dn-brut.json"
CLEANED_CSV="$RUN_DIR/beneficiaires-clean.csv"
REJECTS_CSV="$RUN_DIR/rejets.csv"
IDENTITIES_CSV="$RUN_DIR/identites.csv"
CNAF_EXTRA_CSV="$RUN_DIR/cnaf-extra.csv"
# Fixed name, read by match_dn.sql from the current directory.
MATCH_CANDIDATES_CSV="$RUN_DIR/dn_candidats.csv"
CORRESPONDENCES_CSV="$RUN_DIR/correspondances.csv"
TOUCHED_CSV="$RUN_DIR/lamp01-touchees.csv"
VERDICTS_CSV="$RUN_DIR/verdicts.csv"
INVESTIGATION_CSV="$RUN_DIR/investigation.csv"
TO_CODE_CSV="$RUN_DIR/a-coder.csv"
WITH_CODES_CSV="$RUN_DIR/with-codes.csv"
WRITEBACK_CSV="$RUN_DIR/writeback.csv"
PROD_CSV="$RUN_DIR/prod.csv"
LAMP_CSV="$RUN_DIR/lamp01.csv"
RETOURS_CSV="$RUN_DIR/retours.csv"
# Written once the drop is in /nfs/run: what a resume must not drop twice.
DROPPED_MARKER="$RUN_DIR/depose"
# Written once the injector filed the drop in succes/: what a resume must not wait for again.
INJECTED_MARKER="$RUN_DIR/en-production"
# Written once the injector filed the drop in failed/: the drop is never replayed.
REFUSED_MARKER="$RUN_DIR/refuse"
# Written once lamp01 holds the codes: what a resume must not inject twice.
LAMP_MARKER="$RUN_DIR/lamp01"

rows() { echo $(( $(wc -l < "$1") - 1 )); }

[[ -x "$PYTHON" ]] || die "virtualenv absent : $PYTHON"

drop_production_csv() {
  local nb="$1" nom_depose depose temporaire replay
  nom_depose="beneficiaires-insertion-$nb-$(basename "$RUN_DIR" | cut -c1-19).csv"
  depose="$FC_PROD_DROP_DIR/$nom_depose"
  temporaire="$FC_PROD_DROP_DIR/.$nom_depose.partiel"
  replay="$0 --reprendre $RUN_DIR"

  if (( DRY_RUN )); then
    if [[ ! -d "$FC_PROD_DROP_DIR" || ! -w "$FC_PROD_DROP_DIR" ]]; then
      log "ATTENTION : dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — un passage réel échouerait ici"
    fi
    log "dry-run : rien n'est déposé — un passage réel déposerait $depose ($nb bénéficiaire(s))"
    return
  fi

  local not_dropped="codes tirés mais NON déposés, rien dans lamp01, aucun retour — à reprendre : $replay"
  [[ -d "$FC_PROD_DROP_DIR" && -w "$FC_PROD_DROP_DIR" ]] \
    || die "dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — $not_dropped"
  cp "$PROD_CSV" "$temporaire" || die "$not_dropped"
  # Checked before the rename: once renamed, the injector may move the drop at any time.
  [[ "$(wc -c < "$temporaire")" == "$(wc -c < "$PROD_CSV")" ]] \
    || die "copie incomplète : $temporaire — $not_dropped"
  chmod 640 "$temporaire" || die "$not_dropped"
  mv "$temporaire" "$depose" || die "$not_dropped"
  printf '%s\n' "$depose" >"$DROPPED_MARKER"
  log "déposé -> $depose ($nb bénéficiaire(s))"
}

# lamp01/inject_csv.sh, all or nothing. `essai` plays it and rolls it back.
inject_lamp01() {
  local args=(--port "$LAMP_DB_PORT")
  if [[ "${1:-}" == essai ]]; then args+=(--dry-run); fi
  LAMP_DB_HOST="$LAMP_DB_HOST" LAMP_DB_USER="$LAMP_DB_USER" LAMP_DB_NAME="$LAMP_DB_NAME" \
    LAMP_DB_PASSWORD="$LAMP_DB_PASSWORD" \
    "$LAMP_INJECT" "${args[@]}" "$LAMP_CSV"
}

# Where the injector filed drop $2 in $1: <name without .csv>/<name>, next to its .log, or <name>.
filed_drop() {
  local path
  for path in "$1/${2%.csv}/$2" "$1/$2"; do
    if [[ -e "$path" ]]; then printf '%s\n' "$path"; return 0; fi
  done
  return 1
}

# Production's injector drains /nfs/run on its own and moves each drop to succes/ once injected,
# or to failed/ when it refuses it: sets PROD_OUTCOME to succes or failed. Still nowhere after
# DN_ATTENTE_PROD_MIN, the run stops to be resumed: production may still take the drop.
wait_for_production() {
  local depose nom etat fin rangement
  PROD_OUTCOME=succes
  if (( DN_ATTENTE_PROD_MIN == 0 )); then
    log "ATTENTION : production non vérifiée (DN_ATTENTE_PROD_MIN=0), lamp01 et retours suivent quand même — recette seulement"
    return
  fi
  depose="$(cat "$DROPPED_MARKER")"
  nom="$(basename "$depose")"
  step 8/10 "attente de l'injection en production de $nom (au plus $DN_ATTENTE_PROD_MIN min)"
  fin=$(( SECONDS + DN_ATTENTE_PROD_MIN * 60 ))
  until rangement="$(filed_drop "$PROD_SUCCESS_DIR" "$nom")"; do
    if rangement="$(filed_drop "$PROD_FAILED_DIR" "$nom")"; then
      PROD_OUTCOME=failed
      printf '%s\n' "$rangement" >"$REFUSED_MARKER"
      log "ATTENTION : $nom refusé par l'injecteur de production ($rangement)"
      return
    fi
    if [[ -e "$depose" ]]; then
      etat="toujours dans $FC_PROD_DROP_DIR"
    else
      etat="introuvable dans $FC_PROD_DROP_DIR, succes/ et failed/"
    fi
    (( SECONDS < fin )) \
      || die "$nom $etat au bout de $DN_ATTENTE_PROD_MIN min — rien dans lamp01, aucun retour, à reprendre : $0 --reprendre $RUN_DIR"
    sleep "$DN_ATTENTE_PAS_S"
  done
  printf '%s\n' "$depose" >"$INJECTED_MARKER"
  log "injecté en production : $rangement"
}

# Production refused the drop: nothing reached lamp01 nor any usager, and replaying it would
# fail the same way. Its dossiers are told so, the other dossiers get their usual feedback, and
# the run ends in error with nothing left to resume.
feedback_refused() {
  local fichier
  fichier="$(basename "$(cat "$REFUSED_MARKER")")"
  step 10/10 "retours : $fichier refusé par la production"
  "$PYTHON" "$PIPELINE" retours --verdicts "$VERDICTS_CSV" --dn-in "$DN_RAW" \
    --journal "$RETOURS_CSV" --codes "$WRITEBACK_CSV" --refus-production "$fichier" \
    | tee "$RUN_DIR/retours.log" \
    || die "$fichier refusé par la production, retours incomplets (détail dans $RETOURS_CSV) — à reprendre : $0 --reprendre $RUN_DIR"
  rm -f "$RESUME_MARKER"
  die "$fichier refusé par la production ($PROD_FAILED_DIR) : rien dans lamp01, aucun code envoyé ; ses dossiers portent le label « À vérifier », à corriger avant de les relancer"
}

# After the drop: production's verdict, then lamp01 and the feedback; or, when production
# refused the drop, the feedback alone.
finish_after_drop() {
  if [[ -f "$REFUSED_MARKER" ]]; then
    PROD_OUTCOME=failed
  elif [[ -f "$INJECTED_MARKER" ]]; then
    PROD_OUTCOME=succes
  else
    wait_for_production
  fi
  if [[ "$PROD_OUTCOME" == failed ]]; then
    feedback_refused
  fi

  if [[ ! -f "$LAMP_MARKER" ]]; then
    step 9/10 "injection dans la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
    inject_lamp01 \
      || die "injection lamp01 refusée alors que la production détient les codes — aucun retour ; corriger, puis : $0 --reprendre $RUN_DIR"
    : >"$LAMP_MARKER"
  fi
  send_feedback
}

send_feedback() {
  local retours_args=(--verdicts "$VERDICTS_CSV" --dn-in "$DN_RAW" --journal "$RETOURS_CSV"
                      --codes "$WRITEBACK_CSV")
  if (( DRY_RUN )); then retours_args+=(--dry-run); fi
  step 10/10 "retours : annotation / message / label / acceptation des dossiers"
  "$PYTHON" "$PIPELINE" retours "${retours_args[@]}" | tee "$RUN_DIR/retours.log" \
    || die "retours incomplets, détail dans $RETOURS_CSV"
}

summary() {
  printf '%s' "$(sed -n 's/^actions_faites : /actions faites /p; s/^actions_simulees : /actions simulées /p' "$RUN_DIR/retours.log" | paste -sd ',' -)"
}

[[ "$DN_ATTENTE_PROD_MIN" =~ ^[0-9]+$ && "$DN_ATTENTE_PAS_S" =~ ^[1-9][0-9]*$ ]] \
  || die "DN_ATTENTE_PROD_MIN et DN_ATTENTE_PAS_S attendent un nombre entier"

# lamp01: a resume injects too.
[[ -n "${LAMP_DB_PASSWORD:-}" ]] || die "LAMP_DB_PASSWORD manquant — voir lamp01/README.md"
command -v psql >/dev/null || die "psql introuvable"
[[ -x "$LAMP_INJECT" ]] || die "injecteur de la base bénéficiaires absent : $LAMP_INJECT"
LAMP_DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
LAMP_DB_PORT="${LAMP_DB_PORT:-55432}"
LAMP_DB_USER="${LAMP_DB_USER:-u_passsport}"
LAMP_DB_NAME="${LAMP_DB_NAME:-passsport}"
# Never logged: it carries the password.
LAMP_DATABASE_URL="postgresql://${LAMP_DB_USER}:${LAMP_DB_PASSWORD}@${LAMP_DB_HOST}:${LAMP_DB_PORT}/${LAMP_DB_NAME}"

# --- Resume --------------------------------------------------------------------------

if [[ -n "$RESUME_DIR" ]]; then
  log "=== reprise du passage $RUN_DIR"
  [[ -f "$VERDICTS_CSV" ]] || die "verdicts du passage absents : rien à reprendre"
  if [[ -f "$PROD_CSV" ]]; then
    if [[ ! -f "$DROPPED_MARKER" ]]; then
      step 7/10 "dépôt du CSV de production (reprise)"
      drop_production_csv "$(rows "$PROD_CSV")"
    fi
    finish_after_drop
  else
    send_feedback
  fi
  rm -f "$RESUME_MARKER"
  RUN_DETAIL="reprise de $(basename "$RUN_DIR") terminée — $(summary)"
  exit 0
fi

# --- Preflight ---------------------------------------------------------------------

log "=== passage Démarches Numériques, dossier $RUN_DIR"
if (( DRY_RUN )); then
  log "=== DRY-RUN : lecture de DN seulement, codes tirés sur une copie, injection lamp01 annulée, aucun dépôt, aucun retour"
fi

[[ -n "${EXISTING_CODES_PATHFILE_2026:-}" ]] || die "variable d'environnement manquante : EXISTING_CODES_PATHFILE_2026"

CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"

shopt -s nullglob
backlog=("$FC_PROD_DROP_DIR"/beneficiaires-insertion-*.csv "$FC_PROD_DROP_DIR"/.*.csv.partiel)
shopt -u nullglob
if (( ${#backlog[@]} > 0 )); then
  message="dépôt précédent non consommé dans $FC_PROD_DROP_DIR : ${backlog[*]}"
  if (( DRY_RUN )); then
    log "ATTENTION : $message — un passage réel serait reporté ici"
  else
    log "$message — passage reporté"
    RUN_STATUS="reporte"
    RUN_DETAIL="$message"
    exit 0
  fi
fi

if (( DN_ATTENTE_PROD_MIN == 0 )); then
  log "ATTENTION : DN_ATTENTE_PROD_MIN=0, la production ne sera pas vérifiée avant les retours — recette seulement"
fi

# --- 1: DN read --------------------------------------------------------------------

step 1/10 "lecture de Démarches Numériques"
"$PYTHON" "$PIPELINE" fetch --dn-out "$DN_RAW"

# --- 2: cleaning -------------------------------------------------------------------

step 2/10 "nettoyage, une ligne par bénéficiaire"
"$PYTHON" "$PIPELINE" clean --dn-in "$DN_RAW" --output "$CLEANED_CSV" \
  --match-out "$MATCH_CANDIDATES_CSV" --cnaf-extra-out "$CNAF_EXTRA_CSV" \
  --identities-out "$IDENTITIES_CSV" --rejects-out "$REJECTS_CSV"

nb_rejets="$(rows "$REJECTS_CSV")"
if (( nb_rejets > 0 )); then log "ATTENTION : $nb_rejets ligne(s) rejetée(s), motifs dans $REJECTS_CSV"; fi

if (( $(rows "$CLEANED_CSV") == 0 && nb_rejets == 0 )); then
  RUN_STATUS="rien-a-faire"
  RUN_DETAIL="aucun dossier DN à traiter"
  exit 0
fi

# --- 3: lamp01 lookup --------------------------------------------------------------

cd "$RUN_DIR"

step 3/10 "rapprochement avec la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v correspondances="$CORRESPONDENCES_CSV" -v touchees="$TOUCHED_CSV" \
  -v exercice="$FC_EXERCICE_ID" -f "$MATCH_SQL"

"$PYTHON" "$PIPELINE" split --input "$CLEANED_CSV" --correspondences "$CORRESPONDENCES_CSV" \
  --touched "$TOUCHED_CSV" --identities "$IDENTITIES_CSV" --rejects "$REJECTS_CSV" \
  --to-code-out "$TO_CODE_CSV" --verdicts-out "$VERDICTS_CSV" \
  --investigation-out "$INVESTIGATION_CSV"

nb_doublons="$(grep -c ';doublon;' "$VERDICTS_CSV" || true)"
nb_a_verifier="$(grep -c ';a_verifier;' "$VERDICTS_CSV" || true)"
log "$nb_doublons doublon(s), sans nouveau code ; détail des lignes lamp01 dans $INVESTIGATION_CSV"
if (( nb_a_verifier > 0 )); then
  log "ATTENTION : $nb_a_verifier bénéficiaire(s) à vérifier à la main (ressemblance dans lamp01), aucun code : $INVESTIGATION_CSV"
fi
COUNTS="$nb_rejets rejet(s), $nb_doublons doublon(s), $nb_a_verifier à vérifier"
nb_codes=0

if (( $(rows "$TO_CODE_CSV") > 0 )); then

  # --- 4: codes --------------------------------------------------------------------

  step 4/10 "génération des codes -> $WITH_CODES_CSV"
  codes_memory="$CODES_CSV"
  if (( DRY_RUN )); then
    DRY_RUN_CODES_COPY="$RUN_DIR/existing-codes-dry-run.csv"
    if [[ -f "$CODES_CSV" ]]; then cp "$CODES_CSV" "$DRY_RUN_CODES_COPY"; fi
    codes_memory="$DRY_RUN_CODES_COPY"
  fi
  "$PYTHON" "$FC_PIPELINE" codes --input "$TO_CODE_CSV" --output "$WITH_CODES_CSV" \
    --existing-codes "$codes_memory"

  # --- 5: split --------------------------------------------------------------------

  step 5/10 "fichiers de production et lamp01"
  "$PYTHON" "$FC_PIPELINE" writeback --with-codes "$WITH_CODES_CSV" \
    --writeback-out "$WRITEBACK_CSV" --prod-out "$PROD_CSV" \
    --cnaf-extra "$CNAF_EXTRA_CSV" --lamp-out "$LAMP_CSV"

  nb_codes="$(rows "$PROD_CSV")"

  # --- 6: lamp01, rolled back -----------------------------------------------------
  # Played then rolled back: what lamp01 would refuse is known before anything is dropped.
  # The real injection waits for production (step 9).

  step 6/10 "contrôle de l'injection dans la base bénéficiaires, jouée puis annulée ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
  inject_lamp01 essai \
    || die "injection lamp01 refusée — rien n'est déposé, aucun retour"

  # --- 7: /nfs/run -----------------------------------------------------------------
  # From here on, production may take the codes: a failure must be resumed, not replayed.

  if (( ! DRY_RUN )); then printf '%s\n' "$RUN_DIR" >"$RESUME_MARKER"; fi
  step 7/10 "dépôt du CSV de production"
  drop_production_csv "$nb_codes"
else
  log "aucun bénéficiaire à coder — $COUNTS"
fi

# --- 8-10: production, lamp01 and feedback ----------------------------------------------

if (( DRY_RUN )); then
  if (( nb_codes > 0 )); then
    log "dry-run : un passage réel attendrait ici que l'injecteur de production range le fichier dans $PROD_SUCCESS_DIR, puis injecterait lamp01 (déjà jouée et annulée)"
  fi
  send_feedback
elif (( nb_codes > 0 )); then
  finish_after_drop
else
  printf '%s\n' "$RUN_DIR" >"$RESUME_MARKER"
  send_feedback
fi
if (( ! DRY_RUN )); then rm -f "$RESUME_MARKER"; fi

if (( DRY_RUN )); then
  RUN_DETAIL="$nb_codes code(s) à déposer, $COUNTS, $(summary) — rien d'écrit"
else
  RUN_DETAIL="$nb_codes code(s) déposé(s), $COUNTS, $(summary)"
fi
if (( nb_a_verifier > 0 )); then RUN_STATUS="succes-a-verifier"; fi
