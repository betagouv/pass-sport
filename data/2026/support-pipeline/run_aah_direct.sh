#!/usr/bin/env bash
#
# Codes pass Sport for AAH beneficiaries handed over by the support team, end to end:
# lamp01 lookup, code drawing, lamp01 injection, /nfs/run drop, code_direct_aah mail.
#
#   ./run_aah_direct.sh [--dry-run] <fichier.csv>
#
# Input: `genre;Prénom;Nom;Date de naissance;email;Critère d'éligibilité`, e.g.
#   M ; Toto ; MERTZ ; 07/08/2006; toto@example.org ; aah
#
# ORDER — lamp01, then /nfs/run, then the mail: a mail never leaves for a code production was
# not handed. A failed drop after the injection leaves lamp01 holding codes production lacks:
# the run fails loudly with the command to replay.
#
# DRY RUN plays every step without leaving anything outside its run directory: codes are drawn
# on a copy of EXISTING_CODES_PATHFILE_2026, the lamp01 injection is rolled back, nothing is
# dropped and Link Mobility is never called (envois.csv lists what would have gone out).
#
# Each run gets run/<AAAA-MM-JJTHH-MM-SS>[-dry-run]/ and one line in run/passages.log.
#
# Variables (data/.env, the caller's environment wins):
#   EXISTING_CODES_PATHFILE_2026  codes already handed out                  (required)
#   LAMP_DB_PASSWORD              lamp01 database                           (required)
#   LAMP_DB_HOST/PORT/USER/NAME   (defaults 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID                campaign exercice      (default 5)
#   FC_PROD_DROP_DIR              drop directory         (default /nfs/run)
#   FC_LOCK_FILE                  lock shared with the FranceConnect cron (default /tmp/pass-sport-fc.lock)
#   AAH_RUN_DIR                   run directories        (default <this dir>/run)
#   AAH_EMAIL_DELAY_MIN           mail scheduled N minutes later (default 30)
#
# Mail configuration lives in worker/.env.local: LINK_MOBILITY_API_KEY and
# LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH.

set -Eeuo pipefail
# The files below carry identities and email addresses.
umask 007

SUPPORT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$SUPPORT_DIR/../.." && pwd)"
FC_DIR="$DATA_DIR/2026/partners/franceconnect"
PYTHON="$DATA_DIR/.venv/bin/python"
PIPELINE="$SUPPORT_DIR/aah_direct_pipeline.py"
FC_PIPELINE="$FC_DIR/fc_pipeline.py"
WORKER_DIR="$(dirname "$DATA_DIR")/worker"
LAMP_INJECT="$(dirname "$DATA_DIR")/lamp01/inject_csv.sh"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { RUN_ERROR="$*"; log "ERREUR : $*" >&2; exit 1; }

USAGE="usage : $0 [--dry-run] <fichier.csv>"
DRY_RUN=0
INPUT=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*) die "argument inconnu : $arg — $USAGE" ;;
    *) [[ -z "$INPUT" ]] || die "un seul fichier attendu — $USAGE"; INPUT="$arg" ;;
  esac
done
[[ -n "$INPUT" ]] || die "$USAGE"
[[ -r "$INPUT" ]] || die "fichier illisible : $INPUT"
INPUT="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$DATA_DIR/${1#./}" ;;
  esac
}

# --- Environment -------------------------------------------------------------------

CONFIG_VARS=(
  EXISTING_CODES_PATHFILE_2026 FC_PROD_DROP_DIR FC_LOCK_FILE FC_EXERCICE_ID
  AAH_RUN_DIR AAH_EMAIL_DELAY_MIN
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
AAH_RUN_DIR="$(resolve_path "${AAH_RUN_DIR:-$SUPPORT_DIR/run}")"
AAH_EMAIL_DELAY_MIN="${AAH_EMAIL_DELAY_MIN:-30}"

TS_ISO="$(date '+%Y-%m-%dT%H:%M:%S')"
TS_COMPACT="${TS_ISO//:/-}"
RUN_NAME="$TS_COMPACT"
if (( DRY_RUN )); then RUN_NAME+="-dry-run"; fi

RUNS_INDEX="$AAH_RUN_DIR/passages.log"
mkdir -p "$AAH_RUN_DIR"

record_run() {
  local status="$1" exit_code="$2" summary="${3//$'\n'/ }" line
  printf -v line '%s  %-13s  %3s  %s' "$RUN_NAME" "$status" "$exit_code" "$summary"
  printf '%s\n' "$line" >>"$RUNS_INDEX"
  if [[ -n "${RUN_DIR:-}" ]]; then printf '%s\n' "$line" >"$RUN_DIR/STATUT"; fi
}

# --- Lock --------------------------------------------------------------------------
# Shared with the FranceConnect cron: both draw from EXISTING_CODES_PATHFILE_2026 and drop
# into /nfs/run. Taken in dry run too, the code list must not move while it is copied.

exec 9>"$FC_LOCK_FILE"
if ! flock -n 9; then
  log "ERREUR : un autre passage tient le verrou $FC_LOCK_FILE (cron FranceConnect ?) — relancer dans quelques minutes" >&2
  record_run echec 1 "verrou $FC_LOCK_FILE déjà pris"
  exit 1
fi

# --- Run directory -----------------------------------------------------------------

RUN_DIR="$AAH_RUN_DIR/$RUN_NAME"
mkdir "$RUN_DIR"
ln -sfn "$RUN_NAME" "$AAH_RUN_DIR/latest"

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
  ln -sfn "$RUN_NAME" "$AAH_RUN_DIR/derniere-erreur"
  log "=== statut : echec — $RUNS_INDEX"
}

trap 'RUN_ERROR="${RUN_ERROR:-échec (code $?) ligne $LINENO : $BASH_COMMAND}"' ERR
trap on_exit EXIT

log "=== passage AAH direct, dossier $RUN_DIR"
if (( DRY_RUN )); then
  log "=== DRY-RUN : codes tirés sur une copie, injection lamp01 annulée, aucun dépôt, aucun mail"
fi

[[ -n "${EXISTING_CODES_PATHFILE_2026:-}" ]] || die "variable d'environnement manquante : EXISTING_CODES_PATHFILE_2026"
[[ -n "${LAMP_DB_PASSWORD:-}" ]] || die "LAMP_DB_PASSWORD manquant — voir lamp01/README.md"
command -v psql >/dev/null || die "psql introuvable"
command -v pnpm >/dev/null || die "pnpm introuvable"
[[ -x "$PYTHON" ]] || die "virtualenv absent : $PYTHON"
[[ -d "$WORKER_DIR/node_modules" ]] || die "dépendances du worker absentes : pnpm install dans $WORKER_DIR"
[[ -x "$LAMP_INJECT" ]] || die "injecteur de la base bénéficiaires absent : $LAMP_INJECT"

CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"

LAMP_DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
LAMP_DB_PORT="${LAMP_DB_PORT:-55432}"
LAMP_DB_USER="${LAMP_DB_USER:-u_passsport}"
LAMP_DB_NAME="${LAMP_DB_NAME:-passsport}"
# Never logged: it carries the password.
LAMP_DATABASE_URL="postgresql://${LAMP_DB_USER}:${LAMP_DB_PASSWORD}@${LAMP_DB_HOST}:${LAMP_DB_PORT}/${LAMP_DB_NAME}"

INPUT_COPY="$RUN_DIR/entree.csv"
CLEANED_CSV="$RUN_DIR/aah-clean.csv"
REJECTS_CSV="$RUN_DIR/rejets.csv"
IDENTITIES_CSV="$RUN_DIR/identites.csv"
CNAF_EXTRA_CSV="$RUN_DIR/aah-cnaf-extra-field.csv"
# Fixed name, read by match_beneficiaires.sql from the current directory.
MATCH_CANDIDATES_CSV="$RUN_DIR/fc_2026_match_candidates.csv"
MATCHED_CSV="$RUN_DIR/apparies.csv"
UNMATCHED_IDS_CSV="$RUN_DIR/non-apparies-ids.csv"
INCONCLUSIVE_CSV="$RUN_DIR/inconcluants-ids.csv"
KNOWN_CSV="$RUN_DIR/deja-connus.csv"
TO_REVIEW_CSV="$RUN_DIR/a-verifier.csv"
TO_CODE_CSV="$RUN_DIR/aah-a-coder.csv"
WITH_CODES_CSV="$RUN_DIR/aah-with-codes.csv"
WRITEBACK_CSV="$RUN_DIR/aah-writeback.csv"
PROD_CSV="$RUN_DIR/aah-prod.csv"
LAMP_CSV="$RUN_DIR/aah-lamp01.csv"
EMAILS_CSV="$RUN_DIR/aah-emails.csv"
JOURNAL_CSV="$RUN_DIR/envois.csv"

rows() { echo $(( $(wc -l < "$1") - 1 )); }

# --- Preflight ---------------------------------------------------------------------

shopt -s nullglob
backlog=("$FC_PROD_DROP_DIR"/beneficiaires-insertion-*.csv "$FC_PROD_DROP_DIR"/.*.csv.partiel)
shopt -u nullglob
if (( ${#backlog[@]} > 0 )); then
  message="dépôt précédent non consommé dans $FC_PROD_DROP_DIR : ${backlog[*]}"
  if (( DRY_RUN )); then
    log "ATTENTION : $message — un passage réel s'arrêterait ici"
  else
    die "$message — passage suspendu tant qu'il n'a pas été repris"
  fi
fi

# No code is drawn for people nobody could mail.
log "configuration d'envoi (worker/.env.local)"
(cd "$WORKER_DIR" && pnpm --silent codes:aah-emails --check-config)

cp "$INPUT" "$INPUT_COPY"

# --- 1: cleaning -------------------------------------------------------------------

step 1/7 "lecture et contrôle de $INPUT"
"$PYTHON" "$PIPELINE" clean --input "$INPUT_COPY" --output "$CLEANED_CSV" \
  --match-out "$MATCH_CANDIDATES_CSV" --cnaf-extra-out "$CNAF_EXTRA_CSV" \
  --identities-out "$IDENTITIES_CSV" --rejects-out "$REJECTS_CSV"

nb_rejets="$(rows "$REJECTS_CSV")"
if (( nb_rejets > 0 )); then log "ATTENTION : $nb_rejets ligne(s) rejetée(s), motifs dans $REJECTS_CSV"; fi

if (( $(rows "$CLEANED_CSV") == 0 )); then
  RUN_STATUS="rien-a-faire"
  RUN_DETAIL="aucune ligne exploitable, $nb_rejets rejet(s)"
  exit 0
fi

# --- 2: lamp01 lookup --------------------------------------------------------------

cd "$RUN_DIR"

step 2/7 "rapprochement avec la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v apparies="$MATCHED_CSV" -v non_apparies="$UNMATCHED_IDS_CSV" \
  -v inconcluants="$INCONCLUSIVE_CSV" -v exercice="$FC_EXERCICE_ID" \
  -f "$FC_DIR/match_beneficiaires.sql"

"$PYTHON" "$PIPELINE" known --input "$CLEANED_CSV" --matched "$MATCHED_CSV" \
  --inconclusive "$INCONCLUSIVE_CSV" --identities "$IDENTITIES_CSV" --output "$TO_CODE_CSV" \
  --known-out "$KNOWN_CSV" --to-review-out "$TO_REVIEW_CSV"

nb_connus="$(rows "$KNOWN_CSV")"
nb_a_verifier="$(rows "$TO_REVIEW_CSV")"
log "$nb_connus bénéficiaire(s) déjà en base, aucun code ni mail : $KNOWN_CSV"
if (( nb_a_verifier > 0 )); then
  log "ATTENTION : $nb_a_verifier bénéficiaire(s) à vérifier à la main (rapprochement ambigu), aucun code : $TO_REVIEW_CSV"
fi

COUNTS="$nb_rejets rejet(s), $nb_connus déjà connu(s), $nb_a_verifier à vérifier"

if (( $(rows "$TO_CODE_CSV") == 0 )); then
  RUN_STATUS="rien-a-faire"
  RUN_DETAIL="0 code — $COUNTS"
  exit 0
fi

# --- 3: codes ----------------------------------------------------------------------

step 3/7 "génération des codes -> $WITH_CODES_CSV"
codes_memory="$CODES_CSV"
if (( DRY_RUN )); then
  DRY_RUN_CODES_COPY="$RUN_DIR/existing-codes-dry-run.csv"
  if [[ -f "$CODES_CSV" ]]; then cp "$CODES_CSV" "$DRY_RUN_CODES_COPY"; fi
  codes_memory="$DRY_RUN_CODES_COPY"
fi
"$PYTHON" "$FC_PIPELINE" codes --input "$TO_CODE_CSV" --output "$WITH_CODES_CSV" \
  --existing-codes "$codes_memory"

# --- 4: split ----------------------------------------------------------------------

step 4/7 "fichiers de production, lamp01 et mails"
"$PYTHON" "$FC_PIPELINE" writeback --with-codes "$WITH_CODES_CSV" \
  --writeback-out "$WRITEBACK_CSV" --prod-out "$PROD_CSV" \
  --cnaf-extra "$CNAF_EXTRA_CSV" --lamp-out "$LAMP_CSV"
"$PYTHON" "$PIPELINE" emails --with-codes "$WITH_CODES_CSV" --identities "$IDENTITIES_CSV" \
  --output "$EMAILS_CSV"

nb_codes="$(rows "$PROD_CSV")"

# --- 5: lamp01 ---------------------------------------------------------------------
# All or nothing: a failure here leaves nothing dropped and nobody mailed.

step 5/7 "injection dans la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
inject_args=(--port "$LAMP_DB_PORT")
if (( DRY_RUN )); then inject_args+=(--dry-run); fi
LAMP_DB_HOST="$LAMP_DB_HOST" LAMP_DB_USER="$LAMP_DB_USER" LAMP_DB_NAME="$LAMP_DB_NAME" \
  LAMP_DB_PASSWORD="$LAMP_DB_PASSWORD" \
  "$LAMP_INJECT" "${inject_args[@]}" "$LAMP_CSV" \
  || die "injection lamp01 refusée — rien n'est déposé, aucun mail n'est parti"

# --- 6: /nfs/run -------------------------------------------------------------------

step 6/7 "dépôt du CSV de production"
nom_depose="beneficiaires-insertion-$nb_codes-$TS_COMPACT.csv"
depose="$FC_PROD_DROP_DIR/$nom_depose"
temporaire="$FC_PROD_DROP_DIR/.$nom_depose.partiel"
replay="cp $PROD_CSV $temporaire && chmod 640 $temporaire && mv $temporaire $depose"

if (( DRY_RUN )); then
  if [[ ! -d "$FC_PROD_DROP_DIR" || ! -w "$FC_PROD_DROP_DIR" ]]; then
    log "ATTENTION : dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — un passage réel échouerait ici"
  fi
  log "dry-run : rien n'est déposé — un passage réel déposerait $depose ($nb_codes bénéficiaire(s))"
else
  not_dropped="injecté dans lamp01 mais NON déposé, aucun mail n'est parti — à rejouer : $replay"
  [[ -d "$FC_PROD_DROP_DIR" && -w "$FC_PROD_DROP_DIR" ]] \
    || die "dossier de dépôt absent ou non inscriptible : $FC_PROD_DROP_DIR — $not_dropped"
  cp "$PROD_CSV" "$temporaire" || die "$not_dropped"
  chmod 640 "$temporaire" || die "$not_dropped"
  mv "$temporaire" "$depose" || die "$not_dropped"
  [[ "$(wc -c < "$depose")" == "$(wc -c < "$PROD_CSV")" ]] \
    || die "le fichier déposé n'a pas la taille attendue : $depose"
  log "déposé -> $depose ($nb_codes bénéficiaire(s))"
fi

# --- 7: mails ----------------------------------------------------------------------

step 7/7 "envoi des mails code_direct_aah (programmés à +$AAH_EMAIL_DELAY_MIN min)"
email_args=("$EMAILS_CSV" --journal "$JOURNAL_CSV" --in "$AAH_EMAIL_DELAY_MIN")
if (( DRY_RUN )); then email_args+=(--dry-run); fi

(cd "$WORKER_DIR" && pnpm --silent codes:aah-emails "${email_args[@]}") | tee "$RUN_DIR/envois.log" \
  || die "mails non tous envoyés, détail dans $JOURNAL_CSV — à rejouer (les envoyés sont sautés) : cd $WORKER_DIR && pnpm codes:aah-emails ${email_args[*]}"

bilan_mails="$(grep '^bilan' "$RUN_DIR/envois.log" | tail -n 1)"

if (( DRY_RUN )); then
  RUN_DETAIL="$nb_codes code(s) à déposer ($nom_depose), $COUNTS, $bilan_mails — rien d'écrit"
else
  RUN_DETAIL="$nb_codes code(s) déposé(s) ($nom_depose), $COUNTS, $bilan_mails"
fi
if (( nb_a_verifier > 0 )); then RUN_STATUS="succes-a-verifier"; fi
