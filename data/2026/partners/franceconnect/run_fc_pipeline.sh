#!/usr/bin/env bash
#
# Passage complet de la source FranceConnect, sans interaction : les 4 étapes décrites par
# README.md, du tunnel Scalingo jusqu'au dépôt du CSV de production dans /nfs/postgresql.
#
#   crontab -e
#   30 4 * * * /chemin/vers/data/2026/partners/franceconnect/run_fc_pipeline.sh
#
# Le script est fait pour être rejoué : s'il n'y a aucun `eligible_pending` à traiter, il
# sort en 0 sans rien produire. Toute autre sortie non nulle est une anomalie, et cron
# enverra le journal par courriel.
#
# ORDRE CRITIQUE — le CSV de production n'est déposé qu'APRÈS que la base a été marquée et
# le marquage vérifié. Un fichier déposé sans marquage ferait fabriquer un second code aux
# mêmes personnes au passage suivant : le fichier est donc la dernière chose qui bouge.
#
# Variables lues (data/.env, puis /etc/default/pass-sport-fc s'il existe) :
#   SCALINGO_APP                  application Scalingo hébergeant la base      (obligatoire)
#   SCALINGO_API_TOKEN            jeton d'API, pour un `scalingo` non interactif
#   FC_EXPORT_PATHFILE_2026       sortie brute de export_eligible_pending.sql  (obligatoire)
#   DB_FC_EXPORT_2026             CSV nettoyé au schéma PSP                    (obligatoire)
#   EXISTING_CODES_PATHFILE_2026  liste des codes déjà distribués              (obligatoire)
#   FC_PROD_DROP_DIR              dossier de dépôt          (défaut /nfs/postgresql)
#   FC_TUNNEL_PORT                port local du tunnel      (défaut 10000)
#   FC_LOG_DIR                    journaux                  (défaut <ce dossier>/logs)
#   FC_LOCK_FILE                  verrou anti-chevauchement (défaut /tmp/pass-sport-fc.lock)
#   SCALINGO_SSH_IDENTITY         clé privée SSH pour db-tunnel (optionnel, voir plus bas)
#
# Les chemins relatifs de data/.env sont résolus depuis data/, comme pour les notebooks.
#
# Prérequis sur la machine : `psql`, `scalingo` authentifié (SCALINGO_API_TOKEN) avec une clé
# SSH sans phrase de passe, et le virtualenv data/.venv.
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
  FC_PROD_DROP_DIR FC_TUNNEL_PORT FC_LOG_DIR FC_LOCK_FILE
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

FC_PROD_DROP_DIR="${FC_PROD_DROP_DIR:-/nfs/postgresql}"
FC_TUNNEL_PORT="${FC_TUNNEL_PORT:-10000}"
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
[[ -x "$PYTHON" ]]             || die "virtualenv absent : $PYTHON"

EXPORT_CSV="$(resolve_path "$FC_EXPORT_PATHFILE_2026")"
CLEANED_CSV="$(resolve_path "$DB_FC_EXPORT_2026")"
CODES_CSV="$(resolve_path "$EXISTING_CODES_PATHFILE_2026")"
# Le nom du fichier daté, calculé ici pour que les étapes 3 et 4 se le passent sans qu'une
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
TS_COMPACT="${TS_ISO/T/-}"
TS_COMPACT="${TS_COMPACT//:/}"
WITH_CODES_CSV="$(dirname "$CLEANED_CSV")/$TS_COMPACT-fc-with-codes.csv"
PROD_CSV="${WITH_CODES_CSV/-with-codes.csv/-prod.csv}"

# --- Verrou ------------------------------------------------------------------------
# Deux passages simultanés fabriqueraient deux codes aux mêmes personnes : le second attend
# le prochain créneau plutôt que de démarrer.

exec 9>"$FC_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage est déjà en cours ($FC_LOCK_FILE) — abandon"
  exit 0
fi

# --- Tunnel Scalingo ---------------------------------------------------------------

TUNNEL_PID=""
cleanup() {
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    log "tunnel refermé"
  fi
}
trap cleanup EXIT

log "ouverture du tunnel vers $SCALINGO_APP, port local $FC_TUNNEL_PORT"
# db-tunnel monte sa propre connexion SSH, indépendante de `scalingo login` : sans -i, elle
# retombe sur l'agent SSH puis sur ~/.ssh/id_rsa, qui peut ne pas exister sur cette machine.
tunnel_args=(--app "$SCALINGO_APP" db-tunnel -p "$FC_TUNNEL_PORT")
[[ -n "${SCALINGO_SSH_IDENTITY:-}" ]] && tunnel_args+=(-i "$SCALINGO_SSH_IDENTITY")
tunnel_args+=(SCALINGO_POSTGRESQL_URL)

scalingo "${tunnel_args[@]}" >>"$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$FC_TUNNEL_PORT") 2>/dev/null; then
    exec 3<&- 3>&-
    break
  fi
  kill -0 "$TUNNEL_PID" 2>/dev/null || die "le tunnel s'est arrêté — voir le journal"
  sleep 1
done
(exec 3<>"/dev/tcp/127.0.0.1/$FC_TUNNEL_PORT") 2>/dev/null \
  || die "le port $FC_TUNNEL_PORT ne répond toujours pas"
exec 3<&- 3>&-
log "tunnel ouvert"

# L'URL de la base, hôte et port remplacés par ceux du tunnel, et les options de la requête
# par le sslmode que le tunnel impose. Jamais journalisée : elle porte le mot de passe.
# [^@/]+ et non [^/]+ : un mot de passe contenant une arobase serait sinon avalé avec l'hôte.
REMOTE_URL="$(scalingo --app "$SCALINGO_APP" env-get SCALINGO_POSTGRESQL_URL)"
[[ -n "$REMOTE_URL" ]] || die "SCALINGO_POSTGRESQL_URL introuvable sur $SCALINGO_APP"
FC_DATABASE_URL="$(printf '%s' "$REMOTE_URL" \
  | sed -E "s#@[^@/]+/#@127.0.0.1:$FC_TUNNEL_PORT/#; s#\\?.*\$##")?sslmode=disable"

run_psql() { psql "$FC_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

# --- Étape 1 : extraction ----------------------------------------------------------

log "étape 1/4 — extraction des eligible_pending -> $EXPORT_CSV"
run_psql -v out="$EXPORT_CSV" -f "$FC_DIR/export_eligible_pending.sql"

# En-tête seul : personne à servir. C'est le cas nominal d'une cron fréquente, pas une
# erreur — et c'est aussi ce qui prouve, au passage suivant un traitement, que la boucle
# s'est refermée.
if [[ "$(wc -l < "$EXPORT_CSV")" -le 1 ]]; then
  log "aucun bénéficiaire à traiter — rien à déposer"
  exit 0
fi

# --- Étapes 2 et 3 : nettoyage et codes --------------------------------------------

log "étape 2/4 — nettoyage vers le schéma PSP -> $CLEANED_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" clean --input "$EXPORT_CSV" --output "$CLEANED_CSV"

log "étape 3/4 — génération des codes -> $WITH_CODES_CSV"
"$PYTHON" "$FC_DIR/fc_pipeline.py" codes \
  --input "$CLEANED_CSV" --output "$WITH_CODES_CSV" --existing-codes "$CODES_CSV"

# --- Étape 4 : write-back ----------------------------------------------------------
# À partir d'ici des codes existent sans que personne ne le sache en base : c'est la fenêtre
# que le marquage referme, et rien ne doit être déposé avant qu'elle le soit.

log "étape 4/4 — découpage du fichier daté"
"$PYTHON" "$FC_DIR/fc_pipeline.py" writeback \
  --with-codes "$WITH_CODES_CSV" --prod-out "$PROD_CSV"

# `cd` obligatoire : \copy s'exécute côté client et lit fc_2026_writeback.csv relativement au
# dossier d'où psql est lancé.
cd "$FC_DIR"

log "marquage en base (verdict eligible_pending_lca)"
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

# Le nombre de lignes n'est connu qu'une fois le CSV de prod écrit par l'étape 4 : le nom
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
log "=== passage terminé"
