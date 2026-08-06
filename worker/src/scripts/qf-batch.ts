import "../load-env";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { RealClient } from "../eligibility/real-client";
import type { QuotientFamilialData, PivotIdentity, ResourceResult } from "../eligibility/types";

const REQUIRED_COLUMNS = ["family_name", "birthdate"] as const;
const IDENTITY_COLUMNS = [
  "family_name",
  "preferred_username",
  "given_name",
  "birthdate",
  "gender",
  "birthplace",
  "birthcountry",
] as const;

const ADDED_COLUMNS = ["qf_value", "qf_eligible", "qf_error"] as const;
const DEFAULT_QF_THRESHOLD = 700;
const MAX_ATTEMPTS = 3;

// A rate-limit pause does not consume an attempt, so a permanently throttled token
// would otherwise spin here forever. Bounded so a multi-day run fails loudly on a
// revoked/exhausted quota instead of looking busy.
const MAX_RATE_LIMIT_PAUSES = 20;
const INTER_ROW_DELAY_MS = 100;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const rowToIdentity = (row: Record<string, string>): PivotIdentity | null => {
  const familyName = row.family_name?.trim();
  const birthdate = row.birthdate?.trim();
  if (!familyName || !birthdate) return null;

  const gender = row.gender?.trim().toLowerCase();
  return {
    family_name: familyName,
    preferred_username: row.preferred_username?.trim() || undefined,
    given_name: row.given_name?.trim() || undefined,
    birthdate,
    gender: gender === "male" || gender === "female" ? gender : undefined,
    birthplace: row.birthplace?.trim() || undefined,
    birthcountry: row.birthcountry?.trim() || undefined,
  };
};

// How long to wait when the API says the window is exhausted. Mirrors sequence.ts:
// prefer the precise reset over the coarser Retry-After seconds.
const waitMsFor = (result: ResourceResult): number =>
  result.rateLimitResetMs ?? Math.max(1, Number(result.retryAfter ?? 1)) * 1000;

// `notFound` is a real, permanent answer (absent from the CAF/MSA base), not a missing
// one: it settles the row as ineligible so resume never re-calls the API for it.
type Verdict = { value: number | null; error: string | null; notFound?: boolean };

// One row through quotient_familial, pausing (without consuming an attempt) whenever
// the window is exhausted. Returns the QF value, or the reason there is none.
async function screenRow(client: RealClient, identity: PivotIdentity): Promise<Verdict> {
  let rateLimitPauses = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ResourceResult;

    try {
      result = await client.quotientFamilial(identity);
    } catch (error) {
      // RealClient.call rethrows anything that is not an ApiGouvError/RateLimitError.
      if (attempt === MAX_ATTEMPTS) return { value: null, error: (error as Error).message };
      continue;
    }

    // 429: pause for the whole window and try this row again. Not an attempt — a
    // throttled call did no work, so counting it would drop rows for being unlucky.
    if (result.rateLimited) {
      rateLimitPauses += 1;
      if (rateLimitPauses > MAX_RATE_LIMIT_PAUSES) {
        return { value: null, error: `throttlé ${rateLimitPauses} fois d'affilée, abandon` };
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
        return { value: null, error: "réponse sans quotient_familial.valeur" };
      }

      // Proactive: the window is spent, so pause before the next row rather than
      // eating a wasted 429 on it.
      if (result.rateLimitRemaining === 0 && result.rateLimitResetMs != null) {
        console.log(`  window exhausted, pausing ${Math.round(result.rateLimitResetMs / 1000)}s`);
        await sleep(result.rateLimitResetMs);
      }
      return { value, error: null };
    }

    // 404 is a real answer — this person is not in the CAF/MSA base. Settled as
    // ineligible, so it is neither retried in-run nor re-called on the next run.
    if (result.httpStatus === 404) {
      return { value: null, error: "non trouvé (404)", notFound: true };
    }

    if (attempt === MAX_ATTEMPTS) {
      return {
        value: null,
        error: result.error ?? `httpStatus=${result.httpStatus ?? "none"}`,
      };
    }
  }

  return { value: null, error: "épuisé" };
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
  row.qf_eligible === "true" || row.qf_eligible === "false";

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

const verdictColumns = (verdict: Verdict, threshold: number): Record<string, string> => {
  // A QF value decides it; failing that, a 404 settles it as false; anything else is
  // left blank and picked up again on the next run.
  const isEligible =
    verdict.value !== null ? verdict.value < threshold : verdict.notFound ? false : null;
  return {
    qf_value: verdict.value === null ? "" : String(verdict.value),
    qf_eligible: isEligible === null ? "" : String(isEligible),
    qf_error: verdict.error ?? "",
  };
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const [inputPath, outputPath] = positional;

  const thresholdIndex = args.indexOf("--threshold");
  const threshold =
    thresholdIndex === -1 ? DEFAULT_QF_THRESHOLD : Number(args[thresholdIndex + 1] ?? NaN);

  if (!inputPath || !outputPath || Number.isNaN(threshold)) {
    console.error("usage: qf-batch <input.csv> <output.csv> [--threshold 700]");
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

  // Settles one row: no API call when the pivot is unusable, otherwise the QF chain.
  const settle = async (row: Record<string, string>, label: string) => {
    const identity = rowToIdentity(row);
    const verdict: Verdict = identity
      ? await screenRow(client, identity)
      : { value: null, error: "identité pivot incomplète (family_name/birthdate)" };

    const columns = verdictColumns(verdict, threshold);
    console.log(
      `${label}: ${verdict.value ?? "aucun verdict"}` +
        (columns.qf_eligible === "" ? ` (${verdict.error})` : ` -> qf_eligible=${columns.qf_eligible}`),
    );
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
  let eligible = 0;
  let noVerdict = 0;

  const record = async (row: Record<string, string>, columns: Record<string, string>) => {
    if (columns.qf_eligible === "true") eligible += 1;
    if (columns.qf_eligible === "") noVerdict += 1;
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
      `${eligible} éligible(s) (QF < ${threshold}), ` +
      `${noVerdict} encore sans verdict -> ${outputPath}`,
  );
}

main().catch((error: unknown) => {
  console.error("[qf-batch]", error);
  process.exit(1);
});
