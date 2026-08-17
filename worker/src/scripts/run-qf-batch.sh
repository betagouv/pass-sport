#!/usr/bin/env bash
#
# Un passage qf-batch pour un partenaire, du nom de partenaire seul :
#
#   ./src/scripts/run-qf-batch.sh msa
#   systemctl start pass-sport-qf-batch@msa
#
# Les deux chemins (entrée/sortie) sont déduits de la convention du dossier de travail
# partagé (data/2026/partners/qf-batch-workdir), la même que celle des notebooks phase 1 —
# voir le symlink src/scripts/qf-batch-workdir.
#
# Rejouable : qf-batch relit le CSV de sortie, garde les lignes déjà réglées et ne rappelle
# l'API que pour le reste (voir qf-batch.ts) — relancer après une interruption EST la reprise.
#
# Ce script est le seul point d'entrée, à la main comme sous l'unité systemd
# pass-sport-qf-batch@ : passer à la main et passer automatiquement ne peuvent pas diverger.

set -euo pipefail

PARTNER="${1:?usage: run-qf-batch.sh <cnaf|msa>}"
WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_DIR="$(cd "$WORKER_DIR/.." && pwd)"
WORKDIR="$(cd "$WORKER_DIR/../data/2026/partners/qf-batch-workdir" && pwd)"

INPUT="$WORKDIR/${PARTNER}_2026_qf_batch_input.csv"
OUTPUT="$WORKDIR/${PARTNER}_2026_qf_batch_output.csv"
[[ -f "$INPUT" ]] || { echo "entrée introuvable : $INPUT" >&2; exit 1; }

# nvm n'existe pas pour systemd, qui ne lit aucun profil : le sourcer ici est ce qui rend le
# script indépendant de la version de node installée au niveau du système.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
# Le seul .nvmrc du dépôt est à la racine (voir CLAUDE.md) : nvm doit y être invoqué depuis
# là, pas depuis worker/ qui n'a pas le sien — mais `nvm use` modifie le PATH du shell
# courant, donc pas de sous-shell ici, sous peine de perdre le changement à la ligne suivante.
cd "$REPO_DIR" && nvm use >/dev/null

cd "$WORKER_DIR"     # load-env.ts cherche .env.local dans le cwd (jeton API Particulier)
# Cadencement auto-imposé, sous le quota de l'API Particulier. Monter d'un palier = relancer
# avec un QF_RATE plus haut (200, puis 250, puis 300…) ; la reprise fait le reste.
exec pnpm qf:batch "$INPUT" "$OUTPUT" \
  --log-every "${QF_LOG_EVERY:-50}" \
  --rate "${QF_RATE:-200}" \
  --night-rate "${QF_NIGHT_RATE:-500}"
