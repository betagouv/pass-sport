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
# Variables lues (data/.env, puis /etc/default/pass-sport-fc s'il existe) :
#   SCALINGO_APP                  application Scalingo hébergeant la base      (obligatoire)
#   SCALINGO_API_TOKEN            jeton d'API, pour un `scalingo` non interactif
#   FC_EXPORT_PATHFILE_2026       sortie brute de export_eligible_pending.sql  (obligatoire)
#   DB_FC_EXPORT_2026             CSV nettoyé au schéma PSP                    (obligatoire)
#   EXISTING_CODES_PATHFILE_2026  liste des codes déjà distribués              (obligatoire)
#   LAMP_DB_PASSWORD              base bénéficiaires locale                   (obligatoire)
#   LAMP_DB_HOST/PORT/USER/NAME   (défauts 127.0.0.1 / 55432 / u_passsport / passsport)
#   FC_EXERCICE_ID                exercice de la campagne   (défaut 5)
#   FC_PROD_DROP_DIR              dossier de dépôt          (défaut /nfs/run)
#   FC_TUNNEL_PORT                port local du tunnel Postgres (défaut 10000)
#   FC_REDIS_TUNNEL_PORT          port local du tunnel Redis    (défaut 10001)
#   FC_CODE_EMAILS_DRY_RUN        1 : job courriel posé en dry-run, pour un passage d'essai
#   FC_LOG_DIR                    journaux                  (défaut <ce dossier>/logs)
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

set -euo pipefail
# Le CSV déposé porte des identités et des courriels : il ne doit jamais naître lisible par
# tout le monde.
umask 027

FC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$FC_DIR/../../.." && pwd)"
PYTHON="$DATA_DIR/.venv/bin/python"
WORKER_DIR="$(dirname "$DATA_DIR")/worker"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

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
  FC_EXPORT_PATHFILE_2026 DB_FC_EXPORT_2026 EXISTING_CODES_PATHFILE_2026
  FC_PROD_DROP_DIR FC_TUNNEL_PORT FC_REDIS_TUNNEL_PORT FC_CODE_EMAILS_DRY_RUN
  FC_LOG_DIR FC_LOCK_FILE FC_EXERCICE_ID
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
FC_LOG_DIR="${FC_LOG_DIR:-$FC_DIR/logs}"
FC_LOCK_FILE="${FC_LOCK_FILE:-/tmp/pass-sport-fc.lock}"

mkdir -p "$FC_LOG_DIR"
LOG_FILE="$FC_LOG_DIR/fc-$(date '+%Y-%m-%d').log"
exec > >(tee -a "$LOG_FILE") 2>&1

log "=== passage FranceConnect, journal $LOG_FILE"

for var in SCALINGO_APP FC_EXPORT_PATHFILE_2026 DB_FC_EXPORT_2026 EXISTING_CODES_PATHFILE_2026; do
  [[ -n "${!var:-}" ]] || die "variable d'environnement manquante : $var"
done
command -v psql >/dev/null     || die "psql introuvable"
command -v scalingo >/dev/null || die "scalingo introuvable"
command -v pnpm >/dev/null     || die "pnpm introuvable"
[[ -x "$PYTHON" ]]             || die "virtualenv absent : $PYTHON"
[[ -d "$WORKER_DIR/node_modules" ]] || die "dépendances du worker absentes : pnpm install dans $WORKER_DIR"

EXPORT_CSV="$(resolve_path "$FC_EXPORT_PATHFILE_2026")"
CLEANED_CSV="$(resolve_path "$DB_FC_EXPORT_2026")"
CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"
# Le nom du fichier daté, calculé ici pour que les étapes 5 et 6 se le passent sans qu'une
# variable soit éditée à la main.
#
# Horodaté à la seconde, et non à la journée comme generate_codes_lib.dated_output_path : une
# cron peut passer plusieurs fois par jour, et deux passages du même jour écraseraient sinon
# le fichier du précédent — y compris le CSV déposé dans FC_PROD_DROP_DIR, qui en dérive et
# n'a peut-être pas encore été injecté. Les notebooks gardent la granularité du jour : ils
# traitent des exports figés, une fois.
#
# TS_COMPACT sert aussi au nom du CSV déposé en production (beneficiaires-insertion-*), pour éviter
# les ":" dans un nom de fichier ; il est dérivé de TS_ISO plutôt que d'un second appel à `date`,
# pour que les deux noms partagent exactement le même instant.
TS_ISO="$(date '+%Y-%m-%dT%H:%M:%S')"
TS_COMPACT="${TS_ISO//:/-}"
WITH_CODES_CSV="$(dirname "$CLEANED_CSV")/$TS_COMPACT-fc-with-codes.csv"
PROD_CSV="${WITH_CODES_CSV/-with-codes.csv/-prod.csv}"
UNMATCHED_CSV="$(dirname "$CLEANED_CSV")/$TS_COMPACT-fc-non-apparies.csv"

# Noms FIGÉS, dans CE dossier : \copy est la seule commande psql qui n'interpole aucune
# variable dans ses arguments, les .sql qui les lisent ne peuvent donc pas les recevoir en
# paramètre. Ils sont réécrits à chaque passage.
MATCH_CANDIDATES_CSV="$FC_DIR/fc_2026_match_candidates.csv"
CONFIRMED_CSV="$FC_DIR/fc_2026_confirmed.csv"
# Celui-ci n'est lu que par pandas, qui accepte un chemin : il peut être horodaté.
UNMATCHED_IDS_CSV="$(dirname "$CLEANED_CSV")/$TS_COMPACT-fc-non-apparies-ids.csv"

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

# --- Verrou ------------------------------------------------------------------------
# Deux passages simultanés fabriqueraient deux codes aux mêmes personnes : le second attend
# le prochain créneau plutôt que de démarrer.

exec 9>"$FC_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage est déjà en cours ($FC_LOCK_FILE) — abandon"
  exit 0
fi

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
  die "dépôt précédent non consommé dans $FC_PROD_DROP_DIR : ${backlog[*]} — traitement suspendu tant qu'il n'a pas été retiré"
fi

# --- Tunnels Scalingo --------------------------------------------------------------
# Deux tunnels, sur deux ports : Postgres pour les étapes 1, 4 et 6, Redis pour la mise en file
# du job courriel en fin de passage.

TUNNEL_PIDS=()
cleanup() {
  local pid
  for pid in "${TUNNEL_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      log "tunnel refermé"
    fi
  done
}
trap cleanup EXIT

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

# --- Mise en file du job courriel --------------------------------------------------
# Le worker Scalingo envoie leur code aux lignes FranceConnect confirmées et pas encore
# prévenues (worker/src/jobs/fc-code-emails.ts) : ce passage-ci ne fait que poser le job. Posé à
# chaque sortie réussie, même sans nouveau bénéficiaire, car il retente aussi les courriels
# échoués. Ni sur une erreur, ni quand le verrou est pris : le passage suivant s'en charge.

enqueue_code_emails() {
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

log "étape 1/6 — extraction des eligible_pending -> $EXPORT_CSV"
run_psql -v out="$EXPORT_CSV" -f "$FC_DIR/export_eligible_pending.sql"

# En-tête seul : personne à servir. C'est le cas nominal d'une cron fréquente, pas une
# erreur — et c'est aussi ce qui prouve, au passage suivant un traitement, que la boucle
# s'est refermée.
if [[ "$(wc -l < "$EXPORT_CSV")" -le 1 ]]; then
  log "aucun bénéficiaire à traiter — rien à déposer"
  finish
fi

# --- Étape 2 : nettoyage -----------------------------------------------------------

log "étape 2/6 — nettoyage vers le schéma PSP -> $CLEANED_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" clean \
  --input "$EXPORT_CSV" --output "$CLEANED_CSV" --match-out "$MATCH_CANDIDATES_CSV"

# --- Étape 3 : rapprochement avec la base bénéficiaires -----------------------------
# Ce qui remplace l'appel LCA que le parcours FranceConnect ne fait plus : la personne
# est-elle déjà en base avec un code ? AVANT la génération de codes, impérativement — un
# code tiré est comptabilisé dans EXISTING_CODES_PATHFILE_2026 et ne se reprend pas.
#
# `cd` obligatoire : \copy s'exécute côté client et lit fc_2026_match_candidates.csv
# relativement au dossier d'où psql est lancé.
cd "$FC_DIR"

log "étape 3/6 — rapprochement avec la base bénéficiaires ($LAMP_DB_NAME sur $LAMP_DB_HOST:$LAMP_DB_PORT)"
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
  log "étape 4/6 — marquage des appariés (verdict eligible_confirmed)"
  run_psql -f writeback_confirmed.sql

  restants_confirmes="$(run_psql -Atq -f check_confirmed.sql | tail -n 1 | tr -d '[:space:]')"
  [[ "$restants_confirmes" == "0" ]] \
    || die "$restants_confirmes bénéficiaire(s) apparié(s) mais non marqué(s) — passage interrompu"
  log "contrôle du marquage des appariés : 0 restant"
else
  log "étape 4/6 — aucun apparié, rien à marquer"
fi

# Les non-appariés seuls continuent : eux n'ont pas de code, il faut leur en fabriquer un.
log "mise à l'écart des appariés -> $UNMATCHED_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" split-matched \
  --input "$CLEANED_CSV" --unmatched-ids "$UNMATCHED_IDS_CSV" --output "$UNMATCHED_CSV"

# Tout le monde était déjà en base : il n'y a personne à qui fabriquer un code, et donc rien
# à déposer. Ce n'est pas une erreur — c'est même l'issue souhaitable.
if [[ "$(wc -l < "$UNMATCHED_CSV")" -le 1 ]]; then
  log "tous les bénéficiaires étaient déjà en base — rien à déposer"
  finish
fi

# --- Étape 5 : codes ---------------------------------------------------------------

log "étape 5/6 — génération des codes -> $WITH_CODES_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" codes \
  --input "$UNMATCHED_CSV" --output "$WITH_CODES_CSV" --existing-codes "$CODES_CSV"

# --- Étape 6 : write-back ----------------------------------------------------------
# À partir d'ici des codes existent sans que personne ne le sache en base : c'est la fenêtre
# que le marquage referme, et rien ne doit être déposé avant qu'elle le soit.

log "étape 6/6 — découpage du fichier daté"
"$PYTHON" "$FC_DIR/fc_pipeline.py" writeback \
  --with-codes "$WITH_CODES_CSV" --prod-out "$PROD_CSV"

# Le `cd "$FC_DIR"` de l'étape 3 tient toujours : \copy s'exécute côté client et lit
# fc_2026_writeback.csv relativement au dossier d'où psql est lancé.

log "marquage en base (verdict eligible_confirmed)"
run_psql -f writeback_verdict.sql

# -Atq : une valeur nue, sans en-tête ni étiquettes de commande. `tail -n 1` par prudence,
# pour ne dépendre de rien d'autre que de la dernière ligne — le compte cherché.
restants="$(run_psql -Atq -f check_writeback.sql | tail -n 1 | tr -d '[:space:]')"
[[ "$restants" == "0" ]] \
  || die "$restants bénéficiaire(s) encore en eligible_pending après le write-back — $PROD_CSV n'est PAS déposé"
log "contrôle du marquage : 0 bénéficiaire restant"

# --- Dépôt du CSV de production ----------------------------------------------------

mkdir -p "$FC_PROD_DROP_DIR"
[[ -w "$FC_PROD_DROP_DIR" ]] || die "dossier de dépôt non inscriptible : $FC_PROD_DROP_DIR"

# Le nombre de lignes n'est connu qu'une fois le CSV de prod écrit par l'étape 6 : le nom
# déposé ne peut donc être construit qu'ici, pas en même temps que PROD_CSV plus haut.
nb_lignes="$(($(wc -l < "$PROD_CSV") - 1))"
nom_depose="beneficiaires-insertion-$nb_lignes-$TS_COMPACT.csv"

# Copie sous un nom temporaire puis renommage : le renommage est atomique sur un même système
# de fichiers, un consommateur du dossier ne voit donc jamais un fichier à moitié écrit.
depose="$FC_PROD_DROP_DIR/$nom_depose"
temporaire="$FC_PROD_DROP_DIR/.$nom_depose.partiel"
cp "$PROD_CSV" "$temporaire"
chmod 640 "$temporaire"
mv "$temporaire" "$depose"

[[ "$(wc -c < "$depose")" == "$(wc -c < "$PROD_CSV")" ]] \
  || die "le fichier déposé n'a pas la taille attendue : $depose"
rm -f "$PROD_CSV"

log "déposé -> $depose ($nb_lignes bénéficiaire(s))"
finish
