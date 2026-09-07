// Generates src/data/communes.json, the embedded French commune/postal-code dataset used to
// answer city search without calling geo.api.gouv.fr. Two sources are cross-referenced, both
// downloaded manually (neither is fetched by this script — see README.md for where to get them):
//
// - La Poste's "Base officielle des codes postaux" (https://www.data.gouv.fr/datasets/base-officielle-des-codes-postaux),
//   which gives the INSEE code <-> postal code mapping. Its commune names are uppercase, with
//   accents and hyphens stripped (it's a mail-routing file, not a display one), so they aren't
//   used for the `nom` field except as a fallback.
// - INSEE's Code officiel géographique (https://www.insee.fr/fr/information/2560452), which gives
//   the properly-cased, accented official commune name (LIBELLE) for the same INSEE code.
//
// Usage:
//   LAPOSTE_CSV_PATH=/path/to/019HexaSmal.csv COG_CSV_PATH=/path/to/v_commune_2026.csv \
//     node ./scripts/generate-communes-dataset.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

const laPosteCsvPath = process.env.LAPOSTE_CSV_PATH;
const cogCsvPath = process.env.COG_CSV_PATH;

if (!laPosteCsvPath || !cogCsvPath) {
  console.error(
    'Usage: LAPOSTE_CSV_PATH=<path to La Poste "Base officielle des codes postaux" CSV> ' +
      'COG_CSV_PATH=<path to INSEE "Code officiel géographique" communes CSV> ' +
      'node ./scripts/generate-communes-dataset.mjs',
  );
  process.exit(1);
}

// La Poste's file is ISO-8859-1 (Latin-1) encoded, `;`-separated, and its header row is
// prefixed with `#` (e.g. "#Code_commune_INSEE;Nom_de_la_commune;Code_postal;...").
const laPosteRows = parse(readFileSync(laPosteCsvPath).toString('latin1'), {
  delimiter: ';',
  columns: (header) => header.map((column) => column.replace(/^#/, '')),
  skip_empty_lines: true,
});

// The COG file is UTF-8, `,`-separated, quoted.
const cogRows = parse(readFileSync(cogCsvPath).toString('utf-8'), {
  columns: true,
  skip_empty_lines: true,
});

const cogRowByCode = new Map(cogRows.map((row) => [row.COM, row]));

const overseasCode = (code) => (/^(97|98)/.test(code) ? code.slice(0, 3) : code.slice(0, 2));

const communeByCode = new Map();

for (const row of laPosteRows) {
  const code = row.Code_commune_INSEE;
  const postalCode = row.Code_postal;
  if (!code || !postalCode) {
    continue;
  }

  if (!communeByCode.has(code)) {
    const cogRow = cogRowByCode.get(code);
    if (!cogRow) {
      console.warn(
        `[generate-communes-dataset] no INSEE COG entry for commune ${code} ` +
          `(${row.Nom_de_la_commune}) — falling back to the raw La Poste name`,
      );
    }

    communeByCode.set(code, {
      code,
      nom: cogRow?.LIBELLE ?? row.Nom_de_la_commune,
      codesPostaux: new Set(),
      codeDepartement: cogRow?.DEP ?? overseasCode(code),
      // "ARM" = arrondissement municipal: the 45 districts of Paris/Lyon/Marseille, which the
      // app only includes in results when explicitly searching for a birth place.
      isDistrict: cogRow?.TYPECOM === 'ARM',
    });
  }

  communeByCode.get(code).codesPostaux.add(postalCode);
}

// Paris/Lyon/Marseille are split into arrondissements for postal routing, so the parent commune
// itself never appears in the La Poste file — only its 9-20 districts do. Without a synthesised
// parent row, these three cities would be unsearchable whenever includeDistricts is false (the
// club finder's city filter), despite being ordinary, heavily-populated communes. Derived from
// the ARM -> COMPARENT relationship rather than hardcoded by name, so it keeps working if INSEE
// ever changes which cities are split this way.
const districtParentCodes = new Set(
  cogRows.filter((row) => row.TYPECOM === 'ARM' && row.COMPARENT).map((row) => row.COMPARENT),
);

for (const parentCode of districtParentCodes) {
  if (communeByCode.has(parentCode)) {
    continue;
  }
  const parentCogRow = cogRowByCode.get(parentCode);
  if (!parentCogRow) {
    continue;
  }

  const districtCodes = cogRows
    .filter((row) => row.TYPECOM === 'ARM' && row.COMPARENT === parentCode)
    .map((row) => row.COM);

  const codesPostaux = new Set();
  for (const districtCode of districtCodes) {
    for (const postalCode of communeByCode.get(districtCode)?.codesPostaux ?? []) {
      codesPostaux.add(postalCode);
    }
  }

  communeByCode.set(parentCode, {
    code: parentCode,
    nom: parentCogRow.LIBELLE,
    codesPostaux,
    codeDepartement: parentCogRow.DEP,
    isDistrict: false,
  });
}

const communes = Array.from(communeByCode.values())
  .map((commune) => ({ ...commune, codesPostaux: Array.from(commune.codesPostaux).sort() }))
  .sort((a, b) => a.code.localeCompare(b.code));

const outputPath = join(__dirname, '../src/data/communes.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(communes));

console.log(`[generate-communes-dataset] wrote ${communes.length} communes to ${outputPath}`);
