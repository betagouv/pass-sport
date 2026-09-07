#!/usr/bin/env bash
#
# Splits a CSV file into N chunks, each carrying a copy of the header, so a large
# qf-batch input can be run in smaller pieces:
#
#   ./src/scripts/split-csv.sh <input.csv> [chunks]
#
# Chunks land next to the input file, named after the same convention as the
# FranceConnect production drop (beneficiaires-insertion-<rows>-<timestamp>.csv) —
# see run_fc_pipeline.sh. A part suffix is added since, unlike that single-file drop,
# several chunks are produced in the same run and can share both the row count and
# the timestamp.

set -euo pipefail

INPUT="${1:?usage: split-csv.sh <input.csv> [chunks]}"
CHUNKS="${2:-10}"

[[ -f "$INPUT" ]] || { echo "input not found: $INPUT" >&2; exit 1; }
[[ "$CHUNKS" =~ ^[0-9]+$ && "$CHUNKS" -gt 0 ]] || { echo "chunks must be a positive integer: $CHUNKS" >&2; exit 1; }

OUT_DIR="$(cd "$(dirname "$INPUT")" && pwd)"
TOTAL_ROWS=$(( $(wc -l < "$INPUT") - 1 ))
ROWS_PER_CHUNK=$(( (TOTAL_ROWS + CHUNKS - 1) / CHUNKS ))
TS_COMPACT="$(date '+%Y-%m-%dT%H:%M:%S' | tr ':' '-')"

[[ "$TOTAL_ROWS" -gt 0 ]] || { echo "input has no data rows: $INPUT" >&2; exit 1; }

# Precomputed in bash, not awk: each chunk's row count is known up front from
# TOTAL_ROWS/ROWS_PER_CHUNK, and building the filename here keeps the awk script
# a pure "which chunk does this line belong to" lookup.
names=()
for ((i = 1; i <= CHUNKS; i++)); do
  if (( i < CHUNKS )); then
    rows=$ROWS_PER_CHUNK
  else
    rows=$(( TOTAL_ROWS - ROWS_PER_CHUNK * (CHUNKS - 1) ))
  fi
  names+=("$OUT_DIR/beneficiaires-insertion-$rows-$TS_COMPACT-part$(printf '%02d' "$i").csv")
done

awk -v per="$ROWS_PER_CHUNK" -v names="$(printf '%s\n' "${names[@]}")" '
BEGIN { split(names, chunkFile, "\n") }
NR == 1 { header = $0; next }
{
  file = chunkFile[int((NR - 2) / per) + 1]
  if (!(file in seen)) { print header > file; seen[file] = 1 }
  print > file
}' "$INPUT"

echo "$TOTAL_ROWS row(s) split into ${#names[@]} chunk(s):"
printf '  %s\n' "${names[@]}"
