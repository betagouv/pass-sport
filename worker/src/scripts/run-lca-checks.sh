#!/usr/bin/env bash
#
# Déclenche une vérification des bénéficiaires en 'eligible_pending_lca' : ouvre un tunnel Redis
# vers Scalingo, pose le job eligible_pending_lca_checks sur sa queue, referme. Tout le
# traitement (appels LCA /search puis /confirm, bascule du verdict) a lieu sur le worker
# Scalingo — voir worker/src/jobs/lca-checks.ts.
#
#   crontab -e
#   10,40 * * * * /srv/pass-sport/worker/src/scripts/run-lca-checks.sh
#
# Posé par deploy/ansible/tasks/ordonnancement.yml, DÉSACTIVÉ par défaut : voir l'en-tête de
# deploy/ansible/lamp-setup.yml.
#
# Rejouable et sans effet cumulatif : l'id du job est constant, donc si le passage précédent
# n'est pas terminé celui-ci sort en 0 sans rien poser. Toute autre sortie non nulle est une
# anomalie, et cron enverra le journal par courriel — c'est la seule alerte de cette cron.
#
# Les arguments sont passés tels quels à l'enqueueur (--dry-run, --limit N) ; la cron n'en passe
# aucun. Prérequis sur la machine : `scalingo` authentifié avec une clé SSH sans phrase de passe,
# node et pnpm (paquet apt, voir lamp-setup.yml), et `pnpm install` fait dans worker/.
#
# Variables lues (/etc/default/pass-sport-fc, comme run_fc_pipeline.sh) :
#   SCALINGO_APP              application Scalingo hébergeant Redis           (obligatoire)
#   SCALINGO_API_TOKEN        jeton d'API, pour un `scalingo` non interactif
#   SCALINGO_SSH_IDENTITY     clé privée SSH pour db-tunnel (optionnel, voir plus bas)
#   LCA_CHECKS_TUNNEL_PORT    port local du tunnel      (défaut 10001)
#   LCA_CHECKS_LOG_DIR        journaux                  (défaut <worker>/logs)
#   LCA_CHECKS_LOCK_FILE      verrou anti-chevauchement (défaut /tmp/pass-sport-lca-checks.lock)

set -euo pipefail
umask 027

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERREUR : $*" >&2; exit 1; }

# --- Environnement -----------------------------------------------------------------

CONFIG_VARS=(
  SCALINGO_APP SCALINGO_API_TOKEN SCALINGO_SSH_IDENTITY
  LCA_CHECKS_TUNNEL_PORT LCA_CHECKS_LOG_DIR LCA_CHECKS_LOCK_FILE
)

# L'environnement l'emporte sur le fichier de configuration, ce qui permet de viser une autre
# application le temps d'un essai — `SCALINGO_APP=preprod ./run-lca-checks.sh`.
declare -A caller_env=()
for var in "${CONFIG_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then caller_env["$var"]="${!var}"; fi
done

if [[ -f /etc/default/pass-sport-fc ]]; then
  set -a
  # shellcheck source=/dev/null
  . /etc/default/pass-sport-fc
  set +a
fi

for var in "${!caller_env[@]}"; do
  printf -v "$var" '%s' "${caller_env[$var]}"
  export "${var?}"
done

LCA_CHECKS_TUNNEL_PORT="${LCA_CHECKS_TUNNEL_PORT:-10001}"
LCA_CHECKS_LOG_DIR="${LCA_CHECKS_LOG_DIR:-$WORKER_DIR/logs}"
LCA_CHECKS_LOCK_FILE="${LCA_CHECKS_LOCK_FILE:-/tmp/pass-sport-lca-checks.lock}"

mkdir -p "$LCA_CHECKS_LOG_DIR"
LOG_FILE="$LCA_CHECKS_LOG_DIR/lca-checks-$(date '+%Y-%m-%d').log"
exec > >(tee -a "$LOG_FILE") 2>&1

log "=== vérification des eligible_pending_lca, journal $LOG_FILE"

[[ -n "${SCALINGO_APP:-}" ]] || die "variable d'environnement manquante : SCALINGO_APP"
command -v scalingo >/dev/null || die "scalingo introuvable"
command -v pnpm >/dev/null     || die "pnpm introuvable"

# --- Verrou ------------------------------------------------------------------------
# L'id de job constant empêche déjà deux passages de s'empiler côté BullMQ ; ce verrou-ci évite
# qu'un tunnel bloqué laisse s'accumuler des sessions SSH.

exec 9>"$LCA_CHECKS_LOCK_FILE"
if ! flock -n 9; then
  log "un autre passage est déjà en cours ($LCA_CHECKS_LOCK_FILE) — abandon"
  exit 0
fi

# --- Tunnel Redis ------------------------------------------------------------------
# Port 10001, distinct du 10000 de run_fc_pipeline.sh : les deux crons peuvent se croiser, un
# port partagé ferait échouer celle qui arrive en second.

TUNNEL_PID=""
cleanup() {
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    log "tunnel refermé"
  fi
}
trap cleanup EXIT

log "ouverture du tunnel Redis vers $SCALINGO_APP, port local $LCA_CHECKS_TUNNEL_PORT"
# db-tunnel monte sa propre connexion SSH, indépendante de SCALINGO_API_TOKEN : sans -i, elle
# retombe sur l'agent SSH puis sur ~/.ssh/id_rsa, qui peut ne pas exister sous ce compte.
tunnel_args=(--app "$SCALINGO_APP" db-tunnel -p "$LCA_CHECKS_TUNNEL_PORT")
[[ -n "${SCALINGO_SSH_IDENTITY:-}" ]] && tunnel_args+=(-i "$SCALINGO_SSH_IDENTITY")
tunnel_args+=(SCALINGO_REDIS_URL)

scalingo "${tunnel_args[@]}" >>"$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

for _ in $(seq 1 30); do
  if (exec 3<>"/dev/tcp/127.0.0.1/$LCA_CHECKS_TUNNEL_PORT") 2>/dev/null; then
    exec 3<&- 3>&-
    break
  fi
  kill -0 "$TUNNEL_PID" 2>/dev/null || die "le tunnel s'est arrêté — voir le journal"
  sleep 1
done
(exec 3<>"/dev/tcp/127.0.0.1/$LCA_CHECKS_TUNNEL_PORT") 2>/dev/null \
  || die "le port $LCA_CHECKS_TUNNEL_PORT ne répond toujours pas"
exec 3<&- 3>&-
log "tunnel ouvert"

# Jamais journalisée : elle porte le mot de passe.
# [^@/]+ et non [^/]+ : un mot de passe contenant une arobase serait sinon avalé avec l'hôte.
# rediss:// -> redis:// : le certificat de Scalingo ne correspond pas à 127.0.0.1, et le tunnel SSH
# chiffre déjà le transport.
REMOTE_URL="$(scalingo --app "$SCALINGO_APP" env-get SCALINGO_REDIS_URL)"
[[ -n "$REMOTE_URL" ]] || die "SCALINGO_REDIS_URL introuvable sur $SCALINGO_APP"
LCA_CHECKS_REDIS_URL="$(printf '%s' "$REMOTE_URL" \
  | sed -E "s#^rediss://#redis://#; s#@[^@/]+/#@127.0.0.1:$LCA_CHECKS_TUNNEL_PORT/#; s#@[^@/]+\$#@127.0.0.1:$LCA_CHECKS_TUNNEL_PORT#")"
export LCA_CHECKS_REDIS_URL

# --- Mise en file ------------------------------------------------------------------
# Le pnpm du checkout, donc les mêmes versions bullmq/ioredis que celles que Scalingo construit :
# BullMQ encode les métadonnées de ses jobs dans Redis, une divergence se paierait là.

cd "$WORKER_DIR"
log "mise en file du job"
pnpm lca:checks:enqueue "$@"

log "=== passage terminé"
