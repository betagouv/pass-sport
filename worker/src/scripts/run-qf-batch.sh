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
#
# Pas de journalisation propre au script : lancé uniquement sous systemd (Type=simple), tout
# le stdout/stderr part déjà dans le journal (StandardOutput/Error=journal par défaut) —
# journalctl -u pass-sport-qf-batch@<partenaire>. Voir deploy/ansible/tasks/comptes.yml pour
# l'accès (groupe systemd-journal) et pass-sport-qf-batch-alert.sh.j2 pour l'alerte associée.

set -euo pipefail

PARTNER="${1:?usage: run-qf-batch.sh <cnaf|msa>}"
WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKDIR="$(cd "$WORKER_DIR/../data/2026/partners/qf-batch-workdir" && pwd)"

INPUT="$WORKDIR/${PARTNER}_2026_qf_batch_input.csv"
OUTPUT="$WORKDIR/${PARTNER}_2026_qf_batch_output.csv"

[[ -f "$INPUT" ]] || { echo "entrée introuvable : $INPUT" >&2; exit 1; }

# Node vient d'un paquet apt/NodeSource (voir deploy/ansible/lamp-setup.yml), pas de nvm : il
# est déjà sur /usr/bin, sur le PATH par défaut de systemd comme des sessions interactives —
# plus besoin de sourcer quoi que ce soit ici avant d'appeler pnpm.

cd "$WORKER_DIR"     # load-env.ts cherche .env.local dans le cwd (jeton API Particulier)
# Cadencement auto-imposé, sous le quota de l'API Particulier. Monter d'un palier = relancer
# avec un QF_RATE plus haut (200, puis 250, puis 300…) ; la reprise fait le reste.
exec pnpm qf:batch "$INPUT" "$OUTPUT" \
  --log-every "${QF_LOG_EVERY:-1}" \
  --rate "${QF_RATE:-200}" \
  --night-rate "${QF_NIGHT_RATE:-500}"
