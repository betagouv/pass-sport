#!/usr/bin/env bash
#
# Read-only preview of both sources together (see apercu.py), as run_grist_dn.sh merges them,
# without lamp01, the worker, codes, mails nor feedback:
#
#   ./apercu_grist_dn.sh               # overview of the Grist table, then of the DN démarche
#   ./apercu_grist_dn.sh --extraction  # + clean both together, in a private temp directory
#   ./apercu_grist_dn.sh --voir        # + show the fetched rows and the cleaned output, readable
#                                      #   (personal data on screen: not to be pasted anywhere)
#
# Needs the settings of apercu_grist.sh and apercu_dn.sh.

set -euo pipefail

PIPELINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$PIPELINE_DIR/../../.venv/bin/python" "$PIPELINE_DIR/apercu.py" tout "$@"
