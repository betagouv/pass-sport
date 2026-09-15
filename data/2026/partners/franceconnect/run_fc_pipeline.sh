#!/usr/bin/env bash
#
# Passage complet de la source FranceConnect, sans interaction : les 6 étapes décrites par
# README.md, du tunnel Scalingo jusqu'au dépôt du CSV de production dans /nfs/run, puis la mise
# en file du job fc_code_emails du worker, qui envoie leur code aux bénéficiaires confirmés.
#
#   crontab -e
#   30 4 * * * /chemin/vers/data/2026/partners/franceconnect/run_fc_pipeline.sh
#
# Le script est fait pour être rejoué : s'il n'y a aucun `eligible_pending` à traiter, il
# sort en 0 sans rien produire. Toute autre sortie non nulle est une anomalie, et cron
# enverra le journal par courriel.
#
# DEUX BASES, à ne pas confondre : l'extraction et les write-backs visent la base du site,
# sur Scalingo, à travers un tunnel ; le rapprochement de l'étape 3 vise la base
# bénéficiaires locale (lamp01/compose.yml), en direct.
#
# ORDRE CRITIQUE, deux fois —
#   1. le rapprochement passe AVANT la génération des codes. Un code tiré est comptabilisé
#      dans EXISTING_CODES_PATHFILE_2026 et ne se reprend pas : en fabriquer un à quelqu'un
#      qui en a déjà un est précisément ce que cette étape existe pour empêcher ;
#   2. le CSV de production n'est déposé qu'APRÈS que la base a été marquée et le marquage
#      vérifié. Un fichier déposé sans marquage ferait fabriquer un second code aux mêmes
#      personnes au passage suivant : le fichier est donc la dernière chose qui bouge.
#
# UN PASSAGE, UN DOSSIER : tout ce qu'un passage produit — CSV intermédiaires, CSV de prod,
# journal — est rangé dans FC_RUN_DIR/<AAAA-MM-JJTHH-MM-SS>/, et rien n'y est effacé. Chaque
# passage ajoute aussi une ligne à FC_RUN_DIR/passages.log et écrit la même dans son STATUT :
#
#   grep echec run/passages.log        les passages en erreur, dossier en première colonne
#   cat run/latest/run.log             le journal du dernier passage
#   cat run/derniere-erreur/run.log    celui du dernier échec
#
# Un dossier sans STATUT est celui d'un passage tué sans pouvoir se clore (kill -9, coupure).
#
# PASSAGE À BLANC : `run_fc_pipeline.sh --dry-run` joue le passage entier sans rien laisser hors
# de son dossier, suffixé -dry-run. L'extraction et le rapprochement, qui ne font que lire,
# tournent pour de vrai ; les deux write-backs Scalingo et le report dans la base bénéficiaires
# vont au bout de leur transaction, contrôles compris, puis l'annulent ; les codes sont tirés sur
# une copie de EXISTING_CODES_PATHFILE_2026 ; rien n'est déposé et aucun job n'est posé dans
# Redis. De quoi juger l'appariement sur les données réelles avant d'activer la cron.
#
# Variables lues (data/.env, puis /etc/default/pass-sport-fc s'il existe) :
#   SCALINGO_APP                  application Scalingo hébergeant la base      (obligatoire)
#   SCALINGO_API_TOKEN            jeton d'API, pour un `scalingo` non interactif
#   EXISTING_CODES_PATHFILE_2026  liste des codes déjà distribués              (obligatoire)
#   LAMP_DB_PASSWORD              base bénéficiaires locale                   (obligatoire)
#   LAMP_DB_HOST/PORT/USER/NAME   (défauts 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID                exercice de la campagne   (défaut 5)
#   FC_PROD_DROP_DIR              dossier de dépôt          (défaut /nfs/run)
#   FC_TUNNEL_PORT                port local du tunnel Postgres (défaut 10000)
#   FC_REDIS_TUNNEL_PORT          port local du tunnel Redis    (défaut 10001)
#   FC_CODE_EMAILS_DRY_RUN        1 : job courriel posé en dry-run, pour un passage d'essai
#                                 (sans objet avec --dry-run, qui ne pose aucun job)
#   FC_RUN_DIR                    dossiers de passage       (défaut <ce dossier>/run)
#   FC_LOCK_FILE                  verrou anti-chevauchement (défaut /tmp/pass-sport-fc.lock)
#   SCALINGO_SSH_IDENTITY         clé privée SSH pour db-tunnel (optionnel, voir plus bas)
#
# Les chemins relatifs de data/.env sont résolus depuis data/, comme pour les notebooks.
#
# Prérequis sur la machine : `psql`, `scalingo` authentifié (SCALINGO_API_TOKEN) avec une clé
# SSH sans phrase de passe, le virtualenv data/.venv, et pnpm avec `pnpm install` fait dans
# worker/ (pour la mise en file du job courriel).
#
# db-tunnel monte sa propre connexion SSH, indépendante de l'authentification `scalingo` :
# `scalingo login --ssh-identity` ne configure que la poignée de main de login, pas db-tunnel.
# Sans SCALINGO_SSH_IDENTITY, db-tunnel retombe sur l'agent SSH puis sur ~/.ssh/id_rsa — à
# renseigner si la clé à utiliser porte un autre nom.

set -Eeuo pipefail
# Le CSV déposé porte des identités et des courriels : il ne doit jamais naître lisible par
# tout le monde.
umask 027

FC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$FC_DIR/../../.." && pwd)"
PYTHON="$DATA_DIR/.venv/bin/python"
WORKER_DIR="$(dirname "$DATA_DIR")/worker"
LAMP_INJECT="$(dirname "$DATA_DIR")/lamp01/inject_csv.sh"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { RUN_ERROR="$*"; log "ERREUR : $*" >&2; exit 1; }

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) die "argument inconnu : $arg — usage : $0 [--dry-run]" ;;
  esac
done

# Un chemin relatif de data/.env est relatif à data/, jamais au dossier d'où cron nous lance.
resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *)  printf '%s\n' "$DATA_DIR/${1#./}" ;;
  esac
}

# --- Environnement -----------------------------------------------------------------

CONFIG_VARS=(
  SCALINGO_APP SCALINGO_API_TOKEN SCALINGO_SSH_IDENTITY
  EXISTING_CODES_PATHFILE_2026
  FC_PROD_DROP_DIR FC_TUNNEL_PORT FC_REDIS_TUNNEL_PORT FC_CODE_EMAILS_DRY_RUN
  FC_RUN_DIR FC_LOCK_FILE FC_EXERCICE_ID
  LAMP_DB_HOST LAMP_DB_PORT LAMP_DB_USER LAMP_DB_NAME LAMP_DB_PASSWORD
)

# Ce qui est déjà dans l'environnement l'emporte sur les fichiers de configuration : c'est ce
# qui permet un passage d'essai sans toucher à data/.env, dossier de dépôt détourné —
# `FC_PROD_DROP_DIR=/tmp/fc-drop ./run_fc_pipeline.sh`.
declare -A caller_env=()
for var in "${CONFIG_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then caller_env["$var"]="${!var}"; fi
done

source_config() {
  if [[ -f "$1" ]]; then
    set -a
    # shellcheck source=/dev/null
    . "$1"
    set +a
  fi
}

# Les chemins, comme pour les notebooks ; puis ce que la machine seule connaît (jeton
# Scalingo, dossier de dépôt) et qui n'a rien à faire dans le dépôt de code.
source_config "$DATA_DIR/.env"
source_config /etc/default/pass-sport-fc

for var in "${!caller_env[@]}"; do
  printf -v "$var" '%s' "${caller_env[$var]}"
  export "${var?}"
done

FC_PROD_DROP_DIR="${FC_PROD_DROP_DIR:-/nfs/run}"
FC_TUNNEL_PORT="${FC_TUNNEL_PORT:-10000}"
FC_REDIS_TUNNEL_PORT="${FC_REDIS_TUNNEL_PORT:-10001}"
FC_RUN_DIR="$(resolve_path "${FC_RUN_DIR:-$FC_DIR/run}")"
FC_LOCK_FILE="${FC_LOCK_FILE:-/tmp/pass-sport-fc.lock}"

# L'instant du passage : il nomme son dossier et le CSV déposé en production.
#
# À la seconde, et non à la journée comme generate_codes_lib.dated_output_path : une cron peut
# passer plusieurs fois par jour, et deux passages du même jour partageraient sinon leur dossier
# — et le nom du CSV déposé dans FC_PROD_DROP_DIR, qui n'a peut-être pas encore été injecté. Les
# notebooks gardent la granularité du jour : ils traitent des exports figés, une fois.
#
# TS_COMPACT évite les ":" dans les noms de fichiers ; il est dérivé de TS_ISO plutôt que d'un
# second appel à `date`, pour que les deux partagent exactement le même instant.
TS_ISO="$(date '+%Y-%m-%dT%H:%M:%S')"
TS_COMPACT="${TS_ISO//:/-}"

# Le nom du dossier du passage, et la première colonne de passages.log : un passage à blanc s'y
# distingue au premier coup d'œil.
RUN_NAME="$TS_COMPACT"
if (( DRY_RUN )); then RUN_NAME+="-dry-run"; fi

RUNS_INDEX="$FC_RUN_DIR/passages.log"
mkdir -p "$FC_RUN_DIR"

# Une ligne par passage, quelle qu'en soit l'issue. Écrite d'un seul coup et en ajout, elle ne
# s'entremêle pas avec celle d'un passage concurrent.
record_run() {
  local status="$1" exit_code="$2" summary="${3//$'\n'/ }" line
  printf -v line '%s  %-13s  %3s  %s' "$RUN_NAME" "$status" "$exit_code" "$summary"
  printf '%s\n' "$line" >>"$RUNS_INDEX"
  if [[ -n "${RUN_DIR:-}" ]]; then printf '%s\n' "$line" >"$RUN_DIR/STATUT"; fi
}

# --- Verrou ------------------------------------------------------------------------
# Deux passages simultanés fabriqueraient deux codes aux mêmes personnes : le second attend
# le prochain créneau plutôt que de démarrer. Pris avant de créer le dossier du passage : un
# passage écarté ne laisse que sa ligne dans l'index.

exec 9>"$FC_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage est déjà en cours ($FC_LOCK_FILE) — abandon"
  record_run ignore-verrou 0 "un autre passage est déjà en cours"
  exit 0
fi

# --- Dossier du passage ------------------------------------------------------------

RUN_DIR="$FC_RUN_DIR/$RUN_NAME"
# Sans -p : deux passages dans la même seconde ne doivent pas mêler leurs fichiers.
mkdir "$RUN_DIR"
ln -sfn "$RUN_NAME" "$FC_RUN_DIR/latest"

LOG_FILE="$RUN_DIR/run.log"
# 9>&- : tee survit un instant au script, il ne doit pas emporter le verrou avec lui.
exec > >(tee -a "$LOG_FILE" 9>&-) 2>&1

# --- Suivi du passage --------------------------------------------------------------
# Ce que la ligne de passages.log dira du passage. RUN_STATUS n'est retenu que sur une sortie
# en 0 : toute autre sortie est un échec.

RUN_STATUS="succes"
RUN_DETAIL=""
RUN_STEP="préparation"
RUN_ERROR=""
CODES_DRAWN=0
TUNNEL_PIDS=()
DRY_RUN_CODES_COPY=""

step() {
  RUN_STEP="$1"
  log "étape $1 — $2"
}

close_tunnels() {
  local pid
  for pid in "${TUNNEL_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      log "tunnel refermé"
    fi
  done
}

on_exit() {
  local exit_code=$?
  close_tunnels
  # La liste de tous les codes de la campagne n'a pas à être dupliquée dans chaque essai.
  if [[ -n "$DRY_RUN_CODES_COPY" ]]; then rm -f "$DRY_RUN_CODES_COPY"; fi

  if (( exit_code == 0 )); then
    record_run "$RUN_STATUS" 0 "$RUN_DETAIL"
    log "=== statut : $RUN_STATUS"
    return
  fi

  local summary="étape $RUN_STEP"
  if (( CODES_DRAWN )); then summary+=" — codes fabriqués"; fi
  summary+=" — ${RUN_ERROR:-sortie en erreur}"
  record_run echec "$exit_code" "$summary"
  ln -sfn "$RUN_NAME" "$FC_RUN_DIR/derniere-erreur"
  log "=== statut : echec — $RUNS_INDEX"
}

# Une commande qui échoue sans passer par die (set -e) laisse au moins sa trace ; set -E étend
# ce piège aux fonctions.
trap 'RUN_ERROR="${RUN_ERROR:-échec (code $?) ligne $LINENO : $BASH_COMMAND}"' ERR
trap on_exit EXIT

log "=== passage FranceConnect, dossier $RUN_DIR"
if (( DRY_RUN )); then
  log "=== DRY-RUN : write-backs et report annulés, codes tirés sur une copie, aucun dépôt, aucun job"
fi

for var in SCALINGO_APP EXISTING_CODES_PATHFILE_2026; do
  [[ -n "${!var:-}" ]] || die "variable d'environnement manquante : $var"
done
command -v psql >/dev/null     || die "psql introuvable"
command -v scalingo >/dev/null || die "scalingo introuvable"
command -v pnpm >/dev/null     || die "pnpm introuvable"
[[ -x "$PYTHON" ]]             || die "virtualenv absent : $PYTHON"
[[ -d "$WORKER_DIR/node_modules" ]] || die "dépendances du worker absentes : pnpm install dans $WORKER_DIR"
[[ -x "$LAMP_INJECT" ]]        || die "injecteur de la base bénéficiaires absent : $LAMP_INJECT"

# La mémoire des codes, commune à tous les passages : la seule entrée qui vit hors du dossier.
CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"

# Tout le reste naît dans le dossier du passage. Trois noms y sont FIGÉS —
# fc_2026_match_candidates.csv, fc_2026_confirmed.csv, fc_2026_writeback.csv : \copy est la
# seule commande psql qui n'interpole aucune variable dans ses arguments, les .sql qui les lisent
# ne peuvent donc pas les recevoir en paramètre et les cherchent dans le dossier courant.
EXPORT_CSV="$RUN_DIR/fc_2026_eligible_pending.csv"
CLEANED_CSV="$RUN_DIR/fc_2026_clean.csv"
MATCH_CANDIDATES_CSV="$RUN_DIR/fc_2026_match_candidates.csv"
CONFIRMED_CSV="$RUN_DIR/fc_2026_confirmed.csv"
UNMATCHED_IDS_CSV="$RUN_DIR/fc_2026_non_apparies_ids.csv"
UNMATCHED_CSV="$RUN_DIR/fc_2026_non_apparies.csv"
WITH_CODES_CSV="$RUN_DIR/fc-with-codes.csv"
WRITEBACK_CSV="$RUN_DIR/fc_2026_writeback.csv"
PROD_CSV="$RUN_DIR/fc-prod.csv"
# The beneficiaire_cnaf_extra_field rows clean writes, and the production CSV joined to them.
# Only lamp01 receives the latter: without those rows its CAF strategies never find the codes
# issued here again, and the production drop injector refuses the extra columns.
CNAF_EXTRA_CSV="$RUN_DIR/fc_2026_cnaf_extra_field.csv"
LAMP_CSV="$RUN_DIR/fc-lamp01.csv"

# La base bénéficiaires du lamp, sur cette même machine (lamp01/compose.yml). Rien ne
# transite par le réseau : le service n'écoute que sur la boucle locale.
LAMP_DB_HOST="${LAMP_DB_HOST:-127.0.0.1}"
LAMP_DB_PORT="${LAMP_DB_PORT:-55432}"
LAMP_DB_USER="${LAMP_DB_USER:-u_passsport}"
LAMP_DB_NAME="${LAMP_DB_NAME:-passsport}"
[[ -n "${LAMP_DB_PASSWORD:-}" ]] || die "LAMP_DB_PASSWORD manquant — voir lamp01/README.md"

# Jamais journalisée : elle porte le mot de passe. Les composants, eux, le sont.
LAMP_DATABASE_URL="postgresql://${LAMP_DB_USER}:${LAMP_DB_PASSWORD}@${LAMP_DB_HOST}:${LAMP_DB_PORT}/${LAMP_DB_NAME}"

# L'exercice de la campagne : un code d'une campagne précédente n'ouvre plus aucun droit, le
# rapprochement ne doit donc jamais le rendre.
FC_EXERCICE_ID="${FC_EXERCICE_ID:-5}"

# --- Garde-fou : backlog de dépôt --------------------------------------------------
# Chaque nom déposé est unique (timestampé à la seconde) : un consommateur en panne ou en
# retard ne fait donc jamais échouer ce script par collision de nom, il laisse juste
# s'empiler des fichiers jamais repris. On refuse de marquer de nouveaux bénéficiaires en
# base tant qu'un dépôt précédent n'a pas été consommé, plutôt que de découvrir le blocage
# après coup avec des codes déjà générés sans CSV livré.

shopt -s nullglob
backlog=("$FC_PROD_DROP_DIR"/beneficiaires-insertion-*.csv "$FC_PROD_DROP_DIR"/.*.csv.partiel)
shopt -u nullglob

if (( ${#backlog[@]} > 0 )); then
  message="dépôt précédent non consommé dans $FC_PROD_DROP_DIR : ${backlog[*]}"
  # Un passage à blanc ne marque personne : il n'a pas à s'arrêter, seulement à prévenir.
  if (( DRY_RUN )); then
    log "ATTENTION : $message — un passage réel s'arrêterait ici"
  else
    die "$message — traitement suspendu tant qu'il n'a pas été retiré"
  fi
fi

# --- Tunnels Scalingo --------------------------------------------------------------
# Deux tunnels, sur deux ports : Postgres pour les étapes 1, 4 et 6, Redis pour la mise en file
# du job courriel en fin de passage. on_exit les referme.

# db-tunnel monte sa propre connexion SSH, indépendante de `scalingo login` : sans -i, elle
# retombe sur l'agent SSH puis sur ~/.ssh/id_rsa, qui peut ne pas exister sur cette machine.
open_tunnel() {
  local addon_url_var="$1" port="$2" pid
  local tunnel_args=(--app "$SCALINGO_APP" db-tunnel -p "$port")
  [[ -n "${SCALINGO_SSH_IDENTITY:-}" ]] && tunnel_args+=(-i "$SCALINGO_SSH_IDENTITY")
  tunnel_args+=("$addon_url_var")

  log "ouverture du tunnel $addon_url_var vers $SCALINGO_APP, port local $port"
  scalingo "${tunnel_args[@]}" >>"$LOG_FILE" 2>&1 &
  pid=$!
  TUNNEL_PIDS+=("$pid")

  for _ in $(seq 1 30); do
    if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      log "tunnel ouvert"
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || die "le tunnel s'est arrêté — voir le journal"
    sleep 1
  done
  die "le port $port ne répond toujours pas"
}

open_tunnel SCALINGO_POSTGRESQL_URL "$FC_TUNNEL_PORT"

# L'URL de la base, hôte et port remplacés par ceux du tunnel, et les options de la requête
# par le sslmode que le tunnel impose. Jamais journalisée : elle porte le mot de passe.
# [^@/]+ et non [^/]+ : un mot de passe contenant une arobase serait sinon avalé avec l'hôte.
REMOTE_URL="$(scalingo --app "$SCALINGO_APP" env-get SCALINGO_POSTGRESQL_URL)"
[[ -n "$REMOTE_URL" ]] || die "SCALINGO_POSTGRESQL_URL introuvable sur $SCALINGO_APP"
FC_DATABASE_URL="$(printf '%s' "$REMOTE_URL" \
  | sed -E "s#@[^@/]+/#@127.0.0.1:$FC_TUNNEL_PORT/#; s#\\?.*\$##")?sslmode=disable"

run_psql() { psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

# Joue un write-back puis son contrôle, et laisse dans REMAINING le nombre de bénéficiaires du
# passage restés non marqués — 0 attendu.
#
# Le contrôle est lu en -Atq : une valeur nue, sans en-tête ni étiquettes de commande, et
# `tail -n 1` par prudence, pour ne dépendre de rien d'autre que de la dernière ligne. En
# passage à blanc, c'est le write-back lui-même qui joue le contrôle avant d'annuler sa
# transaction, et qui en sort le compte en dernière ligne.
mark_and_check() {
  local writeback_sql="$1" check_sql="$2" output
  if (( DRY_RUN )); then
    output="$(run_psql -v dry_run=1 -f "$writeback_sql")"
    printf '%s\n' "$output"
    REMAINING="$(printf '%s\n' "$output" | tail -n 1 | tr -d '[:space:]')"
    log "dry-run : marquage annulé, la base Scalingo n'a pas bougé"
  else
    run_psql -f "$writeback_sql"
    REMAINING="$(run_psql -Atq -f "$check_sql" | tail -n 1 | tr -d '[:space:]')"
  fi
}

# --- Mise en file du job courriel --------------------------------------------------
# Le worker Scalingo envoie leur code aux lignes FranceConnect confirmées et pas encore
# prévenues (worker/src/jobs/fc-code-emails.ts) : ce passage-ci ne fait que poser le job. Posé à
# chaque sortie réussie, même sans nouveau bénéficiaire, car il retente aussi les courriels
# échoués. Ni sur une erreur, ni quand le verrou est pris : le passage suivant s'en charge.

enqueue_code_emails() {
  if (( DRY_RUN )); then
    log "dry-run : job fc_code_emails non posé, rien n'est écrit dans Redis"
    return
  fi

  open_tunnel SCALINGO_REDIS_URL "$FC_REDIS_TUNNEL_PORT"

  # Jamais journalisée : elle porte le mot de passe. rediss:// -> redis:// : le certificat de
  # Scalingo ne correspond pas à 127.0.0.1, et le tunnel SSH chiffre déjà le transport.
  local remote_redis_url
  remote_redis_url="$(scalingo --app "$SCALINGO_APP" env-get SCALINGO_REDIS_URL)"
  [[ -n "$remote_redis_url" ]] || die "SCALINGO_REDIS_URL introuvable sur $SCALINGO_APP"
  FC_CODE_EMAILS_REDIS_URL="$(printf '%s' "$remote_redis_url" \
    | sed -E "s#^rediss://#redis://#; s#@[^@/]+/#@127.0.0.1:$FC_REDIS_TUNNEL_PORT/#; s#@[^@/]+\$#@127.0.0.1:$FC_REDIS_TUNNEL_PORT#")"
  export FC_CODE_EMAILS_REDIS_URL

  local enqueue_args=()
  [[ "${FC_CODE_EMAILS_DRY_RUN:-}" == "1" ]] && enqueue_args+=(--dry-run)

  # Le pnpm du checkout, donc les mêmes versions bullmq/ioredis que celles que Scalingo
  # construit : BullMQ encode les métadonnées de ses jobs dans Redis.
  log "mise en file du job fc_code_emails${enqueue_args[*]:+ (${enqueue_args[*]})}"
  (cd "$WORKER_DIR" && pnpm fc:code-emails:enqueue "${enqueue_args[@]}")
}

finish() {
  enqueue_code_emails
  log "=== passage terminé"
  exit 0
}

# --- Étape 1 : extraction ----------------------------------------------------------

step 1/6 "extraction des eligible_pending -> $EXPORT_CSV"
run_psql -v out="$EXPORT_CSV" -f "$FC_DIR/export_eligible_pending.sql"

# En-tête seul : personne à servir. C'est le cas nominal d'une cron fréquente, pas une
# erreur — et c'est aussi ce qui prouve, au passage suivant un traitement, que la boucle
# s'est refermée.
if [[ "$(wc -l < "$EXPORT_CSV")" -le 1 ]]; then
  log "aucun bénéficiaire à traiter — rien à déposer"
  RUN_STATUS="rien-a-faire"
  RUN_DETAIL="aucun eligible_pending"
  finish
fi

# --- Étape 2 : nettoyage -----------------------------------------------------------

step 2/6 "nettoyage vers le schéma PSP -> $CLEANED_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" clean \
  --input "$EXPORT_CSV" --output "$CLEANED_CSV" --match-out "$MATCH_CANDIDATES_CSV" \
  --cnaf-extra-out "$CNAF_EXTRA_CSV"

# --- Étape 3 : rapprochement avec la base bénéficiaires -----------------------------
# Ce qui remplace l'appel LCA que le parcours FranceConnect ne fait plus : la personne
# est-elle déjà en base avec un code ? AVANT la génération de codes, impérativement — un
# code tiré est comptabilisé dans EXISTING_CODES_PATHFILE_2026 et ne se reprend pas.
#
# `cd` obligatoire : \copy s'exécute côté client et lit ses CSV à noms figés relativement au
# dossier d'où psql est lancé — celui du passage. D'ici à la fin, les .sql sont donc désignés
# par leur chemin complet.
cd "$RUN_DIR"

step 3/6 "rapprochement avec la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
psql "$LAMP_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v apparies="$CONFIRMED_CSV" -v non_apparies="$UNMATCHED_IDS_CSV" \
  -v exercice="$FC_EXERCICE_ID" \
  -f "$FC_DIR/match_beneficiaires.sql"

nb_apparies="$(($(wc -l < "$CONFIRMED_CSV") - 1))"
log "$nb_apparies bénéficiaire(s) déjà connu(s) de la base — aucun code ne leur sera fabriqué"

# --- Étape 4 : write-back des appariés ----------------------------------------------
# Fait AVANT la génération de codes : ces gens-là sortent du circuit, et rien de ce qui suit
# ne les concerne. Un échec ici laisse simplement le passage suivant les retrouver.

if (( nb_apparies > 0 )); then
  step 4/6 "marquage des appariés (verdict eligible_confirmed)"
  mark_and_check "$FC_DIR/writeback_confirmed.sql" "$FC_DIR/check_confirmed.sql"
  [[ "$REMAINING" == "0" ]] \
    || die "$REMAINING bénéficiaire(s) apparié(s) mais non marqué(s) — passage interrompu"
  log "contrôle du marquage des appariés : 0 restant"
else
  step 4/6 "aucun apparié, rien à marquer"
fi

# Les non-appariés seuls continuent : eux n'ont pas de code, il faut leur en fabriquer un.
log "mise à l'écart des appariés -> $UNMATCHED_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" split-matched \
  --input "$CLEANED_CSV" --unmatched-ids "$UNMATCHED_IDS_CSV" --output "$UNMATCHED_CSV"

# Tout le monde était déjà en base : il n'y a personne à qui fabriquer un code, et donc rien
# à déposer. Ce n'est pas une erreur — c'est même l'issue souhaitable.
if [[ "$(wc -l < "$UNMATCHED_CSV")" -le 1 ]]; then
  log "tous les bénéficiaires étaient déjà en base — rien à déposer"
  RUN_DETAIL="0 déposé, $nb_apparies apparié(s)"
  finish
fi

# --- Étape 5 : codes ---------------------------------------------------------------

step 5/6 "génération des codes -> $WITH_CODES_CSV"
# Dès cet appel, même interrompu, des codes peuvent être comptabilisés dans
# EXISTING_CODES_PATHFILE_2026 : un échec ne se rejoue plus depuis le rapprochement.
codes_memory="$CODES_CSV"
if (( DRY_RUN )); then
  # Un passage à blanc ne distribue rien : la mémoire commune des codes n'a rien à en retenir.
  DRY_RUN_CODES_COPY="$RUN_DIR/existing-codes-dry-run.csv"
  if [[ -f "$CODES_CSV" ]]; then cp "$CODES_CSV" "$DRY_RUN_CODES_COPY"; fi
  codes_memory="$DRY_RUN_CODES_COPY"
else
  CODES_DRAWN=1
fi
"$PYTHON" "$FC_DIR/fc_pipeline.py" codes \
  --input "$UNMATCHED_CSV" --output "$WITH_CODES_CSV" --existing-codes "$codes_memory"

# --- Étape 6 : write-back ----------------------------------------------------------
# À partir d'ici des codes existent sans que personne ne le sache en base : c'est la fenêtre
# que le marquage referme, et rien ne doit être déposé avant qu'elle le soit.

step 6/6 "découpage du fichier du passage"
"$PYTHON" "$FC_DIR/fc_pipeline.py" writeback \
  --with-codes "$WITH_CODES_CSV" --writeback-out "$WRITEBACK_CSV" --prod-out "$PROD_CSV" \
  --cnaf-extra "$CNAF_EXTRA_CSV" --lamp-out "$LAMP_CSV"

# Le `cd "$RUN_DIR"` de l'étape 3 tient toujours : writeback_verdict.sql et check_writeback.sql
# y lisent fc_2026_writeback.csv.

log "marquage en base (verdict eligible_confirmed)"
mark_and_check "$FC_DIR/writeback_verdict.sql" "$FC_DIR/check_writeback.sql"
[[ "$REMAINING" == "0" ]] \
  || die "$REMAINING bénéficiaire(s) encore en eligible_pending après le write-back — $PROD_CSV n'est PAS déposé"
log "contrôle du marquage : 0 bénéficiaire restant"

# --- Dépôt du CSV de production ----------------------------------------------------

# Le nombre de lignes n'est connu qu'une fois le CSV de prod écrit par l'étape 6 : le nom
# déposé ne peut donc être construit qu'ici, pas en même temps que PROD_CSV plus haut.
nb_lignes="$(($(wc -l < "$PROD_CSV") - 1))"
nom_depose="beneficiaires-insertion-$nb_lignes-$TS_COMPACT.csv"
depose="$FC_PROD_DROP_DIR/$nom_depose"

if (( DRY_RUN )); then
  if [[ -d "$FC_PROD_DROP_DIR" && ! -w "$FC_PROD_DROP_DIR" ]]; then
    log "ATTENTION : dossier de dépôt non inscriptible : $FC_PROD_DROP_DIR — un passage réel échouerait ici"
  fi
  log "dry-run : rien n'est déposé — un passage réel déposerait $depose ($nb_lignes bénéficiaire(s)), copie de $PROD_CSV"
else
  mkdir -p "$FC_PROD_DROP_DIR"
  [[ -w "$FC_PROD_DROP_DIR" ]] || die "dossier de dépôt non inscriptible : $FC_PROD_DROP_DIR"

  # Copie sous un nom temporaire puis renommage : le renommage est atomique sur un même système
  # de fichiers, un consommateur du dossier ne voit donc jamais un fichier à moitié écrit.
  temporaire="$FC_PROD_DROP_DIR/.$nom_depose.partiel"
  cp "$PROD_CSV" "$temporaire"
  chmod 640 "$temporaire"
  mv "$temporaire" "$depose"

  [[ "$(wc -c < "$depose")" == "$(wc -c < "$PROD_CSV")" ]] \
    || die "le fichier déposé n'a pas la taille attendue : $depose"

  log "déposé -> $depose ($nb_lignes bénéficiaire(s))"
fi

# --- Report dans la base bénéficiaires -----------------------------------------------
# Les bénéficiaires qui viennent de recevoir un code entrent aussi dans la base que l'étape 3
# interroge : le même enfant remonté plus tard par son autre parent y sera retrouvé, avec ce
# code-ci, au lieu d'en recevoir un second.
#
# APRÈS le dépôt, jamais avant : la base bénéficiaires ne doit porter aucun code que la
# production n'a pas reçu, sinon un rapprochement ultérieur confirmerait quelqu'un avec un
# code qui n'ouvre rien. Un échec ici laisse donc la production juste et la base
# bénéficiaires incomplète — le passage échoue pour que cron le signale, le CSV de prod est
# gardé pour être rejoué à la main, et l'injection étant tout ou rien, rien n'est à défaire.
#
# --port et les LAMP_DB_* explicites : la base même que le rapprochement vient d'interroger,
# quoi que dise lamp01/.env. En passage à blanc, --dry-run va jusqu'aux INSERT puis annule.
inject_args=(--port "$LAMP_DB_PORT")
if (( DRY_RUN )); then inject_args+=(--dry-run); fi

log "report dans la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
if ! LAMP_DB_HOST="$LAMP_DB_HOST" LAMP_DB_USER="$LAMP_DB_USER" LAMP_DB_NAME="$LAMP_DB_NAME" \
     LAMP_DB_PASSWORD="$LAMP_DB_PASSWORD" \
     "$LAMP_INJECT" "${inject_args[@]}" "$LAMP_CSV"; then
  if (( DRY_RUN )); then
    die "dry-run : le report dans la base bénéficiaires serait refusé — voir le journal"
  fi
  # Les codes sont en route vers la production : leur courriel peut partir.
  enqueue_code_emails
  die "bénéficiaires déposés mais NON reportés dans la base bénéficiaires — à rejouer : $LAMP_INJECT --port $LAMP_DB_PORT $LAMP_CSV"
fi

if (( DRY_RUN )); then
  RUN_DETAIL="$nb_lignes à déposer ($nom_depose), $nb_apparies apparié(s) — rien d'écrit"
else
  RUN_DETAIL="$nb_lignes déposé(s) ($nom_depose), $nb_apparies apparié(s)"
fi
finish
