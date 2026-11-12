// Generates src/data/communes.json, the embedded French commune/postal-code dataset used to
// answer city search without calling geo.api.gouv.fr. Three sources are cross-referenced, all
// downloaded manually (none is fetched by this script — see README.md for where to get them):
//
// - La Poste's "Base officielle des codes postaux" (https://www.data.gouv.fr/datasets/base-officielle-des-codes-postaux),
//   which gives the INSEE code <-> postal code mapping. Its commune names are uppercase, with
//   accents and hyphens stripped (it's a mail-routing file, not a display one), so they aren't
//   used for the `nom` field except as a fallback.
// - INSEE's Code officiel géographique (https://www.insee.fr/fr/information/2560452), which gives
//   the properly-cased, accented official commune name (LIBELLE) for the same INSEE code.
// - INSEE's "Événements sur les communes" file from the same COG release, listing every merger,
//   rename and code change since 1943. It yields the former communes (entries carrying
//   `communeActuelle`) and the former codes of current communes (`codesHistoriques`), because
//   partners' records still hold some of those codes.
//
// Usage:
//   LAPOSTE_CSV_PATH=/path/to/019HexaSmal.csv COG_CSV_PATH=/path/to/v_commune_2026.csv \
//     MVT_CSV_PATH=/path/to/v_mvt_commune_2026.csv node ./scripts/generate-communes-dataset.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

const laPosteCsvPath = process.env.LAPOSTE_CSV_PATH;
const cogCsvPath = process.env.COG_CSV_PATH;
const mvtCsvPath = process.env.MVT_CSV_PATH;

if (!laPosteCsvPath || !cogCsvPath || !mvtCsvPath) {
  console.error(
    'Usage: LAPOSTE_CSV_PATH=<path to La Poste "Base officielle des codes postaux" CSV> ' +
      'COG_CSV_PATH=<path to INSEE "Code officiel géographique" communes CSV> ' +
      'MVT_CSV_PATH=<path to INSEE "Événements sur les communes" CSV> ' +
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

// Both INSEE files are UTF-8, `,`-separated, quoted.
const readInseeCsv = (path) =>
  parse(readFileSync(path).toString('utf-8'), { columns: true, skip_empty_lines: true });

const cogRows = readInseeCsv(cogCsvPath);
const mvtRows = readInseeCsv(mvtCsvPath);

// Only COM and ARM rows: a commune nouvelle shares its code with the commune déléguée of its
// chef-lieu (COMD), which would otherwise overwrite the commune nouvelle's own name.
const cogRowByCode = new Map(
  cogRows
    .filter((row) => row.TYPECOM === 'COM' || row.TYPECOM === 'ARM')
    .map((row) => [row.COM, row]),
);

const overseasCode = (code) => (/^(97|98)/.test(code) ? code.slice(0, 3) : code.slice(0, 2));

// Same spelling La Poste uses in Ligne_5, so a former commune's name can be found there.
const normalizeName = (name) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\bSAINTE\b/g, 'STE')
    .replace(/\bSAINT\b/g, 'ST')
    .trim();

const communeByCode = new Map();
const postalCodesByCodeAndLigne5 = new Map();

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
      ...(cogRow?.TYPECOM === 'ARM' ? { codeParent: cogRow.COMPARENT } : {}),
      codesHistoriques: new Set(),
    });
  }

  communeByCode.get(code).codesPostaux.add(postalCode);

  if (row.Ligne_5) {
    const key = `${code}|${normalizeName(row.Ligne_5)}`;
    if (!postalCodesByCodeAndLigne5.has(key)) {
      postalCodesByCodeAndLigne5.set(key, new Set());
    }
    postalCodesByCodeAndLigne5.get(key).add(postalCode);
  }
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
    codesHistoriques: new Set(),
  });
}

// ---------------------------------------------------------------------------------------------
// Former communes and former codes
// ---------------------------------------------------------------------------------------------

const isCurrent = (code) => cogRowByCode.get(code)?.TYPECOM === 'COM';

// Every event that moves a commune's population to another current-commune code: mergers
// (31-34), communes nouvelles (32), removal of a commune déléguée/associée (34, 35),
// department changes (41) and chef-lieu transfers (50). Renames (10) keep the code but are
// recorded too, so the former name stays searchable. A row whose target is a COMD/COMA only
// says the commune lives on as a délégué; its sibling row gives the absorbing COM.
const successorEventsByCode = new Map();

for (const row of mvtRows) {
  if (!['COM', 'COMD', 'COMA'].includes(row.TYPECOM_AV) || row.TYPECOM_AP !== 'COM') {
    continue;
  }
  if (!successorEventsByCode.has(row.COM_AV)) {
    successorEventsByCode.set(row.COM_AV, []);
  }
  successorEventsByCode.get(row.COM_AV).push({ date: row.DATE_EFF, code: row.COM_AP });
}

for (const events of successorEventsByCode.values()) {
  events.sort((a, b) => a.date.localeCompare(b.date));
}

// Follows a code from the event dated `date` onwards until it reaches a code no later event
// moves away from. After the first step, only events strictly after the previous one count, so
// a commune that absorbs others under its own code (X -> X) doesn't loop.
const resolveCurrentCode = (code, date) => {
  let currentCode = code;
  let currentDate = date;
  let isFirstStep = true;
  const visitedCodes = [code];

  for (;;) {
    const next = (successorEventsByCode.get(currentCode) ?? []).find((event) =>
      isFirstStep ? event.date >= currentDate : event.date > currentDate,
    );
    isFirstStep = false;
    if (!next) {
      return { code: currentCode, visitedCodes };
    }
    currentCode = next.code;
    currentDate = next.date;
    visitedCodes.push(currentCode);
  }
};

// Collectivity changes INSEE models as a deletion (MOD 30, Saint-Barthélemy and Saint-Martin
// leaving Guadeloupe in 2007) or as a fresh creation (MOD 20, Mayotte's 985xx codes becoming
// 976xx in 2011), so no event links the old code to the new one.
const UNLINKED_CODE_CHANGES = [
  ['97123', '97701'],
  ['97127', '97801'],
  ...Array.from({ length: 17 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return [`985${suffix}`, `976${suffix}`];
  }),
];

for (const [formerCode, currentCode] of UNLINKED_CODE_CHANGES) {
  communeByCode.get(currentCode)?.codesHistoriques.add(formerCode);
}

// One historical sighting of a commune: a code it held under a name, and when it stopped.
const historicalSightings = [];

for (const row of mvtRows) {
  if (row.TYPECOM_AV === 'COM' && row.COM_AV && row.LIBELLE_AV) {
    historicalSightings.push({ code: row.COM_AV, nom: row.LIBELLE_AV, date: row.DATE_EFF });
  }
}

// Délégués and associées still listed in the COG, whose own event may predate the mvt file.
for (const row of cogRows) {
  if ((row.TYPECOM === 'COMD' || row.TYPECOM === 'COMA') && row.COMPARENT) {
    historicalSightings.push({
      code: row.COM,
      nom: row.LIBELLE,
      date: null,
      parent: row.COMPARENT,
    });
  }
}

const formerCommuneByKey = new Map();

for (const sighting of historicalSightings) {
  const { code: resolvedCode, visitedCodes } = sighting.parent
    ? { code: sighting.parent, visitedCodes: [sighting.code] }
    : resolveCurrentCode(sighting.code, sighting.date);

  const current = communeByCode.get(resolvedCode);
  if (!current || !isCurrent(resolvedCode)) {
    continue;
  }

  // A commune that is current under this very code and name (a restored commune, or a mere
  // intermediate step) isn't a former commune.
  if (isCurrent(sighting.code) && cogRowByCode.get(sighting.code).LIBELLE === sighting.nom) {
    continue;
  }

  const formerCodes = visitedCodes.filter(
    (visitedCode) => visitedCode !== resolvedCode && !isCurrent(visitedCode),
  );

  // Same commune, new code (department change, chef-lieu transfer): no entry of its own, the
  // current commune just remembers the code it used to have.
  if (normalizeName(sighting.nom) === normalizeName(current.nom)) {
    formerCodes.forEach((formerCode) => current.codesHistoriques.add(formerCode));
    continue;
  }

  const key = `${normalizeName(sighting.nom)}|${resolvedCode}`;
  if (!formerCommuneByKey.has(key)) {
    formerCommuneByKey.set(key, {
      nom: sighting.nom,
      latestCode: sighting.code,
      latestDate: sighting.date ?? '9999',
      codesHistoriques: new Set(),
      current,
    });
  }

  const formerCommune = formerCommuneByKey.get(key);
  // The code a former commune had last is the one it is listed under.
  const sightingDate = sighting.date ?? '9999';
  if (sightingDate > formerCommune.latestDate || sighting.parent) {
    formerCommune.latestCode = sighting.code;
    formerCommune.latestDate = sightingDate;
    formerCommune.nom = sighting.nom;
  }
  if (sighting.code !== resolvedCode) {
    formerCommune.codesHistoriques.add(sighting.code);
  }
  formerCodes.forEach((formerCode) => formerCommune.codesHistoriques.add(formerCode));
}

const formerCommunes = Array.from(formerCommuneByKey.values()).map((formerCommune) => {
  const { current } = formerCommune;
  const ligne5PostalCodes = postalCodesByCodeAndLigne5.get(
    `${current.code}|${normalizeName(formerCommune.nom)}`,
  );

  return {
    code: formerCommune.latestCode,
    nom: formerCommune.nom,
    codesPostaux: ligne5PostalCodes ?? current.codesPostaux,
    codeDepartement: current.codeDepartement,
    isDistrict: false,
    codesHistoriques: formerCommune.codesHistoriques,
    communeActuelle: { code: current.code, nom: current.nom },
  };
});

const toOutput = ({ codesHistoriques, codesPostaux, ...commune }) => ({
  ...commune,
  codesPostaux: Array.from(codesPostaux).sort(),
  ...(codesHistoriques.size > 0 ? { codesHistoriques: Array.from(codesHistoriques).sort() } : {}),
});

const communes = [...communeByCode.values(), ...formerCommunes]
  .map(toOutput)
  .sort((a, b) => a.code.localeCompare(b.code) || a.nom.localeCompare(b.nom));

const outputPath = join(__dirname, '../src/data/communes.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(communes));

console.log(
  `[generate-communes-dataset] wrote ${communes.length} communes ` +
    `(${formerCommunes.length} former communes) to ${outputPath}`,
);
