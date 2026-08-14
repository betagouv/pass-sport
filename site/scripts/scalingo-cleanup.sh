#!/usr/bin/env bash
# Runs as the Scalingo Node buildpack's `scalingo-cleanup` hook, which fires after the
# build and after devDependencies are pruned. Everything left in the app directory at that
# point ships in the image, so anything the standalone server does not read is dead weight
# against the 2 GiB image limit — and this app crossed it (2059 MB).
#
# public/ moves rather than copies: it is 220 MB, and the build container has finite disk.
set -euo pipefail
cd "$(dirname "$0")/.."

# next build leaves these outside the standalone output, but the server reads them from
# its own directory — the generated server.js does process.chdir(__dirname).
mv public .next/standalone/public
mv .next/static .next/standalone/.next/static

# Marianne fonts and logos, resolved at runtime with path.resolve(process.cwd(), 'assets')
# in src/app/components/pdf-pass-sport/PdfPassSport.tsx. File tracing already copies them,
# so this only backfills a directory that normally exists — hence cp into it rather than
# mv onto it, which would nest the tree under itself.
mkdir -p .next/standalone/assets
cp -R assets/. .next/standalone/assets/

# Build residue. .next/cache is by far the biggest item: one production build leaves ~730 MB
# of webpack filesystem cache that is worthless once the build is over. .next/server is a
# duplicate of the copy the standalone output carries.
rm -rf assets .next/cache .next/server .next/types .next/trace .next/trace-build node_modules
