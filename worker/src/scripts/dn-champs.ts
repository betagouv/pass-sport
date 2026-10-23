// Reads the support démarche's champs from the DN GraphQL API, prints the entry champs.ts must
// hold for it and checks the one it holds. Read-only, run by hand: the DN token belongs to the
// grist-dn pipeline (data/.env) and never goes on the worker.
//
//   pnpm dn:champs            # démarche DN_DEMARCHE_NUMBER
//   pnpm dn:champs 159278
//
// Exit 1 when champs.ts differs from the démarche or a champ cannot be resolved.

import "../load-env";
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { CHAMPS_BY_DEMARCHE } from "../demarche-numerique/champs";
import { resolveChamps, type ChampDescriptor } from "../demarche-numerique/champs-resolver";

const DATA_ENV = "../data/.env";
if (!process.env.DN_API_TOKEN && existsSync(DATA_ENV)) process.loadEnvFile(DATA_ENV);

const DEFAULT_API_URL = "https://demarche.numerique.gouv.fr/api/v2/graphql";

const QUERY = `query champs($number: Int!) {
  demarche(number: $number) {
    number
    title
    activeRevision {
      champDescriptors {
        __typename id label
        ... on DropDownListChampDescriptor { options }
        ... on RepetitionChampDescriptor {
          champDescriptors { __typename id label ... on DropDownListChampDescriptor { options } }
        }
      }
    }
  }
}`;

type Answer = {
  data?: {
    demarche?: {
      number: number;
      title: string;
      activeRevision: { champDescriptors: ChampDescriptor[] };
    } | null;
  };
  errors?: { message: string }[];
};

const printDescriptors = (descriptors: ChampDescriptor[], indent = "  ") => {
  for (const d of descriptors) {
    const options = d.options?.length ? `  options: ${JSON.stringify(d.options)}` : "";
    console.log(`${indent}${d.__typename.padEnd(34)} ${d.id.padEnd(24)} ${d.label}${options}`);
    if (d.champDescriptors?.length) printDescriptors(d.champDescriptors, `${indent}    `);
  }
};

async function main(): Promise<number> {
  const number = Number(process.argv[2] ?? process.env.DN_DEMARCHE_NUMBER);
  const token = process.env.DN_API_TOKEN;
  const apiUrl = process.env.DN_API_URL || DEFAULT_API_URL;

  if (!Number.isInteger(number) || number <= 0) {
    console.error("usage: pnpm dn:champs <numéro de démarche> (ou DN_DEMARCHE_NUMBER)");
    return 2;
  }
  if (!token) {
    console.error(`DN_API_TOKEN absent (environnement ou ${DATA_ENV})`);
    return 2;
  }

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query: QUERY, variables: { number } }),
  });

  if (!res.ok) {
    console.error(`API DN : HTTP ${res.status}`);
    return 2;
  }

  const answer = (await res.json()) as Answer;
  const demarche = answer.data?.demarche;

  if (answer.errors?.length || !demarche) {
    console.error(`API DN : ${answer.errors?.map((e) => e.message).join(" ; ") ?? "démarche introuvable"}`);
    return 2;
  }

  const descriptors = demarche.activeRevision.champDescriptors;

  console.log(`démarche ${demarche.number} — ${demarche.title}\n`);
  printDescriptors(descriptors);

  const { champs, problems } = resolveChamps(descriptors);

  console.log("\nproblèmes :");
  console.log(problems.length ? problems.map((p) => `  - ${p}`).join("\n") : "  aucun");

  console.log(`\nentrée attendue dans CHAMPS_BY_DEMARCHE (src/demarche-numerique/champs.ts) :\n`);
  console.log(`  ${number}: ${JSON.stringify(champs, null, 2).replace(/\n/g, "\n  ")},`);

  const upToDate = isDeepStrictEqual(CHAMPS_BY_DEMARCHE[number], champs);
  console.log(`\nchamps.ts : ${upToDate ? "à jour" : "À METTRE À JOUR"}`);

  return upToDate && problems.length === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("dn:champs failed:", err);
    process.exit(2);
  });
