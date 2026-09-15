// Persiste dans eligibility_results.allocataire_conjoint_identite le conjoint qu'un passage
// qf-batch de rattrapage a retrouvé (voir data/2026/partners/franceconnect/README.md).
//
//   pnpm conjoint:backfill <sortie-qf-batch.csv>              # dry-run, rien n'est écrit
//   pnpm conjoint:backfill <sortie-qf-batch.csv> --apply
//   pnpm conjoint:backfill <sortie-qf-batch.csv> --apply --limit 50
//
// La colonne est de niveau foyer, comme `caisse` : toutes les lignes d'un même sub la
// portent. Seules celles qui l'ont encore à NULL sont écrites — un conjoint posé par le
// worker pendant le parcours n'est jamais écrasé, et relancer le script ne réécrit rien.
//
// Écriture en base de PRODUCTION : le dry-run est le défaut, --apply un geste manuel.

import "../load-env";
import { createReadStream, existsSync } from "node:fs";
import { parse } from "csv-parse";
import pg from "pg";
import { conjointUpdatesFromRows, type BatchRow } from "./backfill-conjoint-rows";

// FC_DATABASE_URL est l'URL réécrite par le tunnel que pose run_fc_pipeline.sh ; le défaut de
// db/client.ts sert quand le script tourne dans un conteneur Scalingo.
const DATABASE_URL =
  process.env.FC_DATABASE_URL ??
  process.env.SCALINGO_POSTGRESQL_URL ??
  "postgres://passport:passport@localhost:5432/passport";

// Partagé par le dry-run et l'écriture : compter autre chose que ce qu'on écrira rendrait le
// premier mensonger.
const CIBLE = "where allocataire_fc_sub = $1 and allocataire_conjoint_identite is null";

const readRows = async (path: string): Promise<BatchRow[]> => {
  const parser = createReadStream(path).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  ) as AsyncIterable<BatchRow>;

  const rows: BatchRow[] = [];

  for await (const row of parser) rows.push(row);

  return rows;
};

const VALUED_OPTIONS = ["--limit"];

const numberOption = (args: string[], name: string): number | undefined => {
  const index = args.indexOf(name);

  if (index === -1) return undefined;

  const parsed = Number(args[index + 1]);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} attend un entier positif, reçu "${args[index + 1]}"`);
  }

  return parsed;
};

// Saute la valeur qui suit une option valuée, sinon `--limit 50` avant le chemin ferait de
// "50" le fichier d'entrée.
const positionalArgs = (args: string[]): string[] => {
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    if (VALUED_OPTIONS.includes(args[index])) {
      index += 1;
      continue;
    }
    if (!args[index].startsWith("--")) positional.push(args[index]);
  }

  return positional;
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const limit = numberOption(args, "--limit");
  const [inputPath] = positionalArgs(args);

  if (!inputPath) {
    console.error("usage: backfill-conjoint <sortie-qf-batch.csv> [--apply] [--limit 50]");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(inputPath)) {
    console.error(`fichier introuvable: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const rows = await readRows(inputPath);
  const updates = conjointUpdatesFromRows(rows).slice(0, limit ?? Infinity);

  console.log(
    `${rows.length} ligne(s) lue(s), ${updates.length} foyer(s) avec conjoint identifié` +
      (limit ? ` (limité à ${limit})` : "") +
      (apply ? "" : " — dry-run, rien ne sera écrit"),
  );

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    let ecrites = 0;
    let candidates = 0;

    for (const { sub, conjoint } of updates) {
      if (apply) {
        const ecrit = await pool.query(
          `update eligibility_results set allocataire_conjoint_identite = $2 ${CIBLE}`,
          [sub, conjoint],
        );

        ecrites += ecrit.rowCount ?? 0;
        continue;
      }

      const cible = await pool.query<{ count: string }>(
        `select count(*)::text as count from eligibility_results ${CIBLE}`,
        [sub],
      );
      const lignes = Number(cible.rows[0]?.count ?? 0);

      candidates += lignes;
      console.log(`  ${sub}: ${lignes} ligne(s) -> ${conjoint.family_name ?? "(sans nom)"}`);
    }

    console.log(
      apply
        ? `\n${ecrites} ligne(s) mises à jour`
        : `\n${candidates} ligne(s) seraient mises à jour — relancer avec --apply pour écrire`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[backfill-conjoint]", error);
  process.exit(1);
});
