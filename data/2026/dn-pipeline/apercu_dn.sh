#!/usr/bin/env bash
#
# Read-only preview of the Démarches Numériques démarche (see apercu.py):
#
#   ./apercu_dn.sh               # access, labels, dossiers per state, champs vs mapping.py
#   ./apercu_dn.sh --extraction  # + clean the dossiers en instruction as the pipeline does, in a
#                                #   private temp directory (works before the labels exist)
#   ./apercu_dn.sh --voir        # + show the fetched dossiers and the cleaned output, readable
#                                #   (personal data on screen: not to be pasted anywhere)
#
# Needs DN_API_TOKEN and DN_DEMARCHE_NUMBER (environment or data/.env); DN_API_URL is optional.

set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$PIPELINE_DIR/../../.venv/bin/python" "$PIPELINE_DIR/apercu.py" "$@"
