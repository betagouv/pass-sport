#!/usr/bin/env bash
#
# Read-only preview of the Grist table (see apercu.py):
#
#   ./apercu_grist.sh               # access, columns vs mapping.py, values met in Eligibilité,
#                                   #   Situation, Caisse, Genre, Statut, rows to process
#   ./apercu_grist.sh --extraction  # + clean the rows to process as the pipeline does, in a
#                                   #   private temp directory
#   ./apercu_grist.sh --voir        # + show the fetched rows and the cleaned output, readable
#                                   #   (personal data on screen: not to be pasted anywhere)
#
# Needs GRIST_API_URL (https://<instance>/api), GRIST_API_KEY, GRIST_DOC_ID and GRIST_TABLE_ID
# (environment or data/.env); GRIST_COLONNE_MOTIF is optional.

set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$PIPELINE_DIR/../../.venv/bin/python" "$PIPELINE_DIR/apercu.py" grist "$@"
