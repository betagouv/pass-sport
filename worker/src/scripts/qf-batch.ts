import "../load-env";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { RealClient } from "../eligibility/real-client";
import type { QuotientFamilialData, PivotIdentity, ResourceResult } from "../eligibility/types";

// Matches the 'allocataire-*' column convention already used across the data/
// partner notebooks (CNAF/MSA/CNOUS), rather than the FranceConnect-flavored
// vocabulary of PivotIdentity, so a notebook export needs no extra rename step.
const REQUIRED_COLUMNS = ["allocataire-nom_naissance", "allocataire-date_naissance"] as const;
const IDENTITY_COLUMNS = [
  "allocataire-nom_naissance",
  "allocataire-nom_usage",
  "allocataire-prenom",
  "allocataire-date_naissance",
  "allocataire-genre",
  "allocataire-code_insee_naissance",
  "allocataire-code_pays_naissance",
] as const;

// No eligibility verdict is computed here: the script only records the QF value the
// API returned, and the threshold comparison is left to whoever consumes the output.
// `qf_status` is what marks a row as settled, since an absent value is a legitimate
// outcome for a 404.
// `qf_request_url` est une colonne de debug : elle rejoue l'appel tel qu'il est parti
// (URL + query params). Le SDK ne l'expose que sur ses erreurs, donc elle reste vide
// sur les lignes trouvées. Elle contient l'identité pivot en clair — à ne pas diffuser.
const ADDED_COLUMNS = ["qf_value", "qf_status", "qf_error", "qf_request_url"] as const;
const STATUS_FOUND = "trouve";
const STATUS_NOT_FOUND = "non_trouve";
const MAX_ATTEMPTS = 3;

// A rate-limit pause does not consume an attempt, so a permanently throttled token
// would otherwise spin here forever. Bounded so a multi-day run fails loudly on a
// revoked/exhausted quota instead of looking busy.
const MAX_RATE_LIMIT_PAUSES = 20;
const INTER_ROW_DELAY_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const rowToIdentity = (row: Record<string, string>): PivotIdentity | null => {
  const familyName = row["allocataire-nom_naissance"]?.trim();
  const birthdate = row["allocataire-date_naissance"]?.trim();
  if (!familyName || !birthdate) return null;

  const gender = row["allocataire-genre"]?.trim().toLowerCase();
  return {
    family_name: familyName,
    preferred_username: row["allocataire-nom_usage"]?.trim() || undefined,
    given_name: row["allocataire-prenom"]?.trim() || undefined,
    birthdate,
    gender: gender === "male" || gender === "female" ? gender : undefined,
    birthplace: row["allocataire-code_insee_naissance"]?.trim() || undefined,
    birthcountry: row["allocataire-code_pays_naissance"]?.trim() || undefined,
  };
};

// How long to wait when the API says the window is exhausted. Mirrors sequence.ts:
// prefer the precise reset over the coarser Retry-After seconds.
const waitMsFor = (result: ResourceResult): number =>
  result.rateLimitResetMs ?? Math.max(1, Number(result.retryAfter ?? 1)) * 1000;

// `notFound` is a real, permanent answer (absent from the CAF/MSA base), not a missing
// one: it settles the row as ineligible so resume never re-calls the API for it.
type Verdict = {
  value: number | null;
  error: string | null;
  notFound?: boolean;
  requestUrl?: string | null;
};

// One row through quotient_familial, pausing (without consuming an attempt) whenever
// the window is exhausted. Returns the QF value, or the reason there is none.
async function screenRow(client: RealClient, identity: PivotIdentity): Promise<Verdict> {
  let rateLimitPauses = 0;

  // Dernière URL remontée par le SDK, quel que soit l'essai — lue au moment du return,
  // donc toujours celle de la tentative qui a produit le verdict.
  let requestUrl: string | null = null;
  const verdict = (v: Omit<Verdict, "requestUrl">): Verdict => ({ ...v, requestUrl });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ResourceResult;

    try {
      result = await client.quotientFamilial(identity);
    } catch (error) {
      // RealClient.call rethrows anything that is not an ApiGouvError/RateLimitError.
      if (attempt === MAX_ATTEMPTS) return verdict({ value: null, error: (error as Error).message });
      continue;
    }

    requestUrl = result.requestUrl ?? requestUrl;

    // 429: pause for the whole window and try this row again. Not an attempt — a
    // throttled call did no work, so counting it would drop rows for being unlucky.
    if (result.rateLimited) {
      rateLimitPauses += 1;
      if (rateLimitPauses > MAX_RATE_LIMIT_PAUSES) {
        return verdict({ value: null, error: `throttlé ${rateLimitPauses} fois d'affilée, abandon` });
      }
      const waitMs = waitMsFor(result);
      console.log(`  rate limited, pausing ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      attempt -= 1;
      continue;
    }

    if (result.success && result.data) {
      const value = (result.data as QuotientFamilialData).quotient_familial?.valeur;
      if (typeof value !== "number") {
        return verdict({ value: null, error: "réponse sans quotient_familial.valeur" });
      }

      // Proactive: the window is spent, so pause before the next row rather than
      // eating a wasted 429 on it.
      if (result.rateLimitRemaining === 0 && result.rateLimitResetMs != null) {
        console.log(`  window exhausted, pausing ${Math.round(result.rateLimitResetMs / 1000)}s`);
        await sleep(result.rateLimitResetMs);
      }
      return verdict({ value, error: null });
    }

    // 404 is a real answer — this person is not in the CAF/MSA base. Settled as
    // ineligible, so it is neither retried in-run nor re-called on the next run.
    if (result.httpStatus === 404) {
      return verdict({ value: null, error: "non trouvé (404)", notFound: true });
    }

    if (attempt === MAX_ATTEMPTS) {
      return verdict({
        value: null,
        error: result.error ?? `httpStatus=${result.httpStatus ?? "none"}`,
      });
    }
  }

  return verdict({ value: null, error: "épuisé" });
}

async function readFirstLine(path: string): Promise<string> {
  const readline = createInterface({ input: createReadStream(path), crlfDelay: Infinity });

  try {
    // Optimization, otherwise it reads the whole file
    for await (const line of readline) {
      return line;
    }
    return "";
  } finally {
    readline.close();
  }
}

// A row is settled once it carries a real verdict. Anything else — an API error, a
// 404, an incomplete pivot, an interrupted write — is retried on the next run.
const hasVerdict = (row: Record<string, string>): boolean =>
  row.qf_status === STATUS_FOUND || row.qf_status === STATUS_NOT_FOUND;

const readOutputRows = (path: string): AsyncIterable<Record<string, string>> =>
  createReadStream(path).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  ) as AsyncIterable<Record<string, string>>;

// Feeds one record to a stringifier, honouring back-pressure.
async function writeRow(
  stringifier: ReturnType<typeof stringify>,
  record: Record<string, string>,
): Promise<void> {
  if (!stringifier.write(record)) {
    await new Promise<void>((resolve) => stringifier.once("drain", () => resolve()));
  }
}

async function closeStream(
  stringifier: ReturnType<typeof stringify>,
  stream: ReturnType<typeof createWriteStream>,
): Promise<void> {
  stringifier.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });
}

const verdictColumns = (verdict: Verdict): Record<string, string> => {
  // A QF value settles the row; failing that, a 404 settles it as absent from the base;
  // anything else leaves the status blank and is picked up again on the next run.
  const status =
    verdict.value !== null ? STATUS_FOUND : verdict.notFound ? STATUS_NOT_FOUND : "";
  return {
    qf_value: verdict.value === null ? "" : String(verdict.value),
    qf_status: status,
    qf_error: verdict.error ?? "",
    qf_request_url: verdict.requestUrl ?? "",
  };
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const [inputPath, outputPath] = positional;

  // A line per row is fine for a few hundred rows, but floods the log on a
  // multi-day, large-volume run — only print one line every N rows then.
  const logEveryIndex = args.indexOf("--log-every");
  const logEvery = logEveryIndex === -1 ? 1 : Number(args[logEveryIndex + 1] ?? NaN);

  if (!inputPath || !outputPath || Number.isNaN(logEvery) || logEvery < 1) {
    console.error("usage: qf-batch <input.csv> <output.csv> [--log-every 1]");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(inputPath)) {
    console.error(`fichier introuvable: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  // Header check up front: a typo in a column name would otherwise show up as every
  // single row failing after the API has already been called thousands of times.
  const firstLine = await readFirstLine(inputPath);

  // trim() also strips a leading BOM (U+FEFF is ECMAScript WhiteSpace), which Excel
  // prepends when saving CSV as UTF-8.
  const header = firstLine
    .split(",")
    .map((column) => column.trim());

  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));

  if (missing.length > 0) {
    console.error(`colonnes manquantes dans ${inputPath}: ${missing.join(", ")}`);
    console.error(`colonnes d'identité reconnues: ${IDENTITY_COLUMNS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const client = new RealClient();
  const outColumns = [...header, ...ADDED_COLUMNS];

  let settled = 0;

  // Settles one row: no API call when the pivot is unusable, otherwise the QF chain.
  const settle = async (row: Record<string, string>, label: string) => {
    const identity = rowToIdentity(row);
    const verdict: Verdict = identity
      ? await screenRow(client, identity)
      : {
          value: null,
          error: "identité pivot incomplète (allocataire-nom_naissance/allocataire-date_naissance)",
        };

    const columns = verdictColumns(verdict);
    settled += 1;
    if (settled % logEvery === 0) {
      console.log(
        `${label}: ${verdict.value ?? "aucun verdict"}` +
          (columns.qf_status === "" ? ` (${verdict.error})` : ` -> qf_status=${columns.qf_status}`),
      );
    }
    if (INTER_ROW_DELAY_MS > 0) await sleep(INTER_ROW_DELAY_MS);
    return columns;
  };

  // Single pass into a temp file, swapped over the output as soon as the re-read is
  // done (see the rename below). Rewriting rather than appending is what lets an
  // unsettled row be replaced in place, keeping the output exactly one row per input
  // row. A leftover .tmp from a killed run is truncated by flags "w".
  const tmpPath = `${outputPath}.tmp`;
  const stringifier = stringify({ header: true, columns: outColumns });
  const tmpStream = createWriteStream(tmpPath, { flags: "w" });
  stringifier.pipe(tmpStream);

  let done = 0;
  let called = 0;
  let withQf = 0;
  let noVerdict = 0;

  const record = async (row: Record<string, string>, columns: Record<string, string>) => {
    if (columns.qf_status === STATUS_FOUND) withQf += 1;
    if (columns.qf_status === "") noVerdict += 1;
    await writeRow(stringifier, { ...row, ...columns });
  };

  // Rows already written: keep the settled ones, redo the rest.
  if (existsSync(outputPath)) {
    for await (const row of readOutputRows(outputPath)) {
      done += 1;
      if (hasVerdict(row)) {
        await record(row, row);
        continue;
      }
      called += 1;
      await record(row, await settle(row, `reprise ligne ${done}`));
    }
    console.log(`reprise: ${done} ligne(s) relue(s), ${called} sans verdict réessayée(s)\n`);
  }

  // createWriteStream is lazy — on a fresh run nothing has been written yet, so the
  // temp does not exist and the rename below would ENOENT. Wait for the open.
  if (tmpStream.pending) {
    await new Promise<void>((resolve) => tmpStream.once("open", () => resolve()));
  }

  // Swap the temp over the output now that every pre-existing row has been copied.
  // POSIX rename does not invalidate an open fd, so the stream keeps writing into what
  // is now the output file — from here on the remaining rows land incrementally and a
  // crash leaves a valid prefix instead of discarding the whole run. Until this point
  // the original was still intact, which is what makes the re-read above safe.
  await rename(tmpPath, outputPath);

  // Input rows never reached.
  const parser = createReadStream(inputPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  ) as AsyncIterable<Record<string, string>>;

  let index = 0;
  for await (const row of parser) {
    index += 1;
    if (index <= done) continue;
    called += 1;
    await record(row, await settle(row, `ligne ${index}`));
  }

  await closeStream(stringifier, tmpStream);

  console.log(
    `\n${index} ligne(s) au total, ${called} appel(s) API ce run: ` +
      `${withQf} QF récupéré(s), ` +
      `${noVerdict} encore sans verdict -> ${outputPath}`,
  );
}

main().catch((error: unknown) => {
  console.error("[qf-batch]", error);
  process.exit(1);
});
