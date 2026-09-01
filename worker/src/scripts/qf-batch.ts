import "../load-env";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import { RealClient } from "../eligibility/real-client";
import type { QuotientFamilialData, PivotIdentity, ResourceResult } from "../eligibility/types";
import { AdaptiveRatePacer, type RateChange, type RateChangeReason } from "./rate-pacer";

// Matches the 'allocataire-*' column convention already used across the data/
// partner notebooks (CNAF/MSA/CNOUS), rather than the FranceConnect-flavored
// vocabulary of PivotIdentity, so a notebook export needs no extra rename step.
// allocataire-code_pays_naissance (-> code_cog_insee_pays_naissance) is required too: without
// it the QF call is missing a mandatory état civil param, so a row with an empty value is
// skipped just like a missing nom_naissance/date_naissance (see rowToIdentity).
const REQUIRED_COLUMNS = [
  "allocataire-nom_naissance",
  "allocataire-date_naissance",
  "allocataire-code_pays_naissance",
] as const;
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
// `qf_http_status` garde le dernier code HTTP vu pour la ligne (200 sur une réussite, 404,
// 429, 5xx…) — sans lui un 5xx et une identité simplement absente de la base sont
// indiscernables une fois dans le CSV, alors que c'est justement ce qui distingue une panne
// de l'API d'une réponse normale.
// `qf_request_url` est une colonne de debug : elle rejoue l'appel tel qu'il est parti
// (URL + query params). Le SDK ne l'expose que sur ses erreurs, donc elle reste vide
// sur les lignes trouvées. Elle contient l'identité pivot en clair — à ne pas diffuser.
const ADDED_COLUMNS = [
  "qf_value",
  "qf_status",
  "qf_http_status",
  "qf_error",
  "qf_request_url",
] as const;
const STATUS_FOUND = "trouve";
const STATUS_NOT_FOUND = "non_trouve";
// Code 35560 : la base a assez d'éléments pour répondre, mais pas assez pour trancher sur
// cette identité (ex. homonymes) — une réponse définitive elle aussi, distincte du 404
// "vraiment absent de la base" (STATUS_NOT_FOUND) pour ne pas la confondre en aval.
const STATUS_NOT_FOUND_INSUFFICIENT_INFO = "non_trouve_pas_assez_info";
const INSUFFICIENT_INFO_ERROR_CODE = "35560";
const MAX_ATTEMPTS = 3;

// A rate-limit pause does not consume an attempt, so a permanently throttled token
// would otherwise spin here forever. Bounded so a multi-day run fails loudly on a
// revoked/exhausted quota instead of looking busy.
const MAX_RATE_LIMIT_PAUSES = 20;

// A 5xx that isn't PROVIDER_DATA_ERROR_CODE (see below) means the API is in maintenance:
// retry the same call every 10 minutes until it answers something else. Bounded (~24h) so a
// permanently broken deployment fails loudly instead of pausing for days.
const MAINTENANCE_RETRY_MS = 7_000;
const MAX_MAINTENANCE_PAUSES = 144;

// Cooldown after a 404 "Erreur inattendue" (API instability, not a real not-found)
// before retrying the same row.
const INSTABILITY_COOLDOWN_MS = 10_000; // 15 seconds

// Ceilings for the adaptive pacer, kept below the API's own: AIMD probes up to them,
// and the 429 path stays the backstop if they turn out to be set too high.
const DEFAULT_RATE_PER_MINUTE = 400;
const DEFAULT_NIGHT_RATE_PER_MINUTE = 600;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Cadence changes are the main thing to follow on a multi-day run, so each one is
// timestamped in Paris time rather than left to be located by its position in the log.
const parisTimestampFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  dateStyle: "short",
  timeStyle: "medium",
});

const RATE_CHANGE_CAUSES: Record<RateChangeReason, string> = {
  start: "démarrage",
  "day-night": "bascule jour/nuit",
  increase: "hausse après succès",
  decrease: "baisse après erreur",
};

const formatRateChange = ({
  ratePerMinute,
  previousRatePerMinute,
  ceilingPerMinute,
  isNight,
  reason,
  timestampMs,
}: RateChange): string => {
  const at = parisTimestampFormatter.format(new Date(timestampMs));
  const window = `plafond ${ceilingPerMinute}/min ${isNight ? "nuit" : "jour"}`;

  if (reason === "start") {
    return `[${at}] cadence initiale ${ratePerMinute}/min (${window})`;
  }

  return (
    `[${at}] cadence ${previousRatePerMinute} -> ${ratePerMinute}/min ` +
    `(${RATE_CHANGE_CAUSES[reason]}, ${window})`
  );
};

const rowToIdentity = (row: Record<string, string>): PivotIdentity | null => {
  const familyName = row["allocataire-nom_naissance"]?.trim();
  const birthdate = row["allocataire-date_naissance"]?.trim();
  const birthcountry = row["allocataire-code_pays_naissance"]?.trim();
  if (!familyName || !birthdate || !birthcountry) return null;

  const gender = row["allocataire-genre"]?.trim().toLowerCase();
  return {
    family_name: familyName,
    preferred_username: row["allocataire-nom_usage"]?.trim() || undefined,
    given_name: row["allocataire-prenom"]?.trim() || undefined,
    birthdate,
    gender: gender === "male" || gender === "female" ? gender : undefined,
    birthplace: row["allocataire-code_insee_naissance"]?.trim() || undefined,
    birthcountry,
  };
};

// How long to wait when the API says the window is exhausted. Mirrors sequence.ts:
// prefer the precise reset over the coarser Retry-After seconds.
const waitMsFor = (result: ResourceResult): number =>
  result.rateLimitResetMs ?? Math.max(1, Number(result.retryAfter ?? 1)) * 1000;

// A 404 normally settles the row, but the API also answers 404 "Erreur inattendue" for
// its own transient failures — that one is instability, not an answer about the person.
const isUnexpected404 = (result: ResourceResult): boolean =>
  result.httpStatus === 404 && (result.error ?? "").toLowerCase().includes("erreur inattendue");

// JSON:API error code seen on a 5xx that is actually the data provider (CNAF/MSA) choking on
// this one row's data, not the API Particulier platform being down — e.g.
// {"errors":[{"code":"35000","title":"Erreur interne du fournisseur de données", ...}]}.
// Settled as an ordinary row failure, never fed into the maintenance streak below.
const PROVIDER_DATA_ERROR_CODE = "35000";

// `notFound` is a real, permanent answer (absent from the CAF/MSA base), not a missing
// one: it settles the row as ineligible so resume never re-calls the API for it.
// `insufficientInfo` (code 35560) is the same kind of permanent, definitive answer — the base
// just cannot disambiguate this identity — so it settles the row exactly like `notFound` does.
type Verdict = {
  value: number | null;
  error: string | null;
  notFound?: boolean;
  insufficientInfo?: boolean;
  httpStatus?: number | null;
  // JSON:API error code, kept only to tell a provider-data 5xx (PROVIDER_DATA_ERROR_CODE)
  // apart from a genuine API outage — not written to the output CSV.
  errorCode?: string;
  requestUrl?: string | null;
  // Round-trip of the call that produced this verdict — logged only, not written to the
  // output CSV. Slow responses are an early tell for API trouble, ahead of an outright 5xx.
  responseTimeMs?: number | null;
};

// One row through quotient_familial, pausing (without consuming an attempt) whenever
// the window is exhausted. Returns the QF value, or the reason there is none.
async function screenRow(
  client: RealClient,
  identity: PivotIdentity,
  pacer: AdaptiveRatePacer,
): Promise<Verdict> {
  let rateLimitPauses = 0;
  let maintenancePauses = 0;

  // Dernière URL, code HTTP/erreur et temps de réponse remontés par le SDK, quel que soit
  // l'essai — lus au moment du return, donc toujours ceux de la tentative qui a produit le
  // verdict.
  let requestUrl: string | null = null;
  let httpStatus: number | null = null;
  let errorCode: string | undefined;
  let responseTimeMs: number | null = null;
  const verdict = (
    v: Omit<Verdict, "requestUrl" | "httpStatus" | "errorCode" | "responseTimeMs">,
  ): Verdict => ({
    ...v,
    requestUrl,
    httpStatus,
    errorCode,
    responseTimeMs,
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let result: ResourceResult;

    // Per attempt, not per row: a row can burn up to MAX_ATTEMPTS calls plus every retry
    // after a 429, and pacing per row would quietly overshoot the quota.
    await pacer.acquire();

    const callStartedMs = Date.now();

    try {
      result = await client.quotientFamilial(identity);
    } catch (error) {
      responseTimeMs = Date.now() - callStartedMs;
      // RealClient.call rethrows anything that is not an ApiGouvError/RateLimitError.
      if (attempt === MAX_ATTEMPTS) return verdict({ value: null, error: (error as Error).message });
      continue;
    }

    responseTimeMs = Date.now() - callStartedMs;
    requestUrl = result.requestUrl ?? requestUrl;
    httpStatus = result.httpStatus ?? httpStatus;
    errorCode = result.errorCode ?? errorCode;

    // Code 35560, whatever the httpStatus it rides on: the base cannot disambiguate this
    // identity (not enough info, e.g. homonyms), a definitive answer settled right away —
    // never retried, in this run or the next (see hasVerdict/STATUS_NOT_FOUND_INSUFFICIENT_INFO).
    if (errorCode === INSUFFICIENT_INFO_ERROR_CODE) {
      pacer.onSuccess(); // a well-formed answer, not a sign of API trouble
      return verdict({
        value: null,
        error: result.error ?? "informations insuffisantes pour identifier la personne",
        insufficientInfo: true,
      });
    }

    // 5xx: settled right away when the SDK surfaced PROVIDER_DATA_ERROR_CODE — that one is the
    // data provider (CNAF/MSA) choking on this one row's data, not the platform being down.
    // Any other 5xx is taken as API maintenance: retry the same call every 10 minutes without
    // consuming an attempt, and without touching the adaptive rate — maintenance is not a load
    // signal.
    if (result.httpStatus != null && result.httpStatus >= 500) {
      if (errorCode === PROVIDER_DATA_ERROR_CODE) {
        return verdict({ value: null, error: result.error ?? `erreur serveur (${result.httpStatus})` });
      }

      maintenancePauses += 1;

      if (maintenancePauses > MAX_MAINTENANCE_PAUSES) {
        return verdict({
          value: null,
          error: `API en maintenance depuis ${maintenancePauses * 10} minutes, abandon`,
        });
      }

      console.log(`API en maintenance (${result.httpStatus}, ${responseTimeMs}ms), retry dans 10 min`);

      await sleep(MAINTENANCE_RETRY_MS);
      attempt -= 1;
      continue;
    }

    // 429: back the cadence off, pause for the whole window and try this row again.
    // Not an attempt — a throttled call did no work, so counting it would drop rows
    // for being unlucky.
    if (result.rateLimited) {
      pacer.onError();
      rateLimitPauses += 1;

      if (rateLimitPauses > MAX_RATE_LIMIT_PAUSES) {
        return verdict({ value: null, error: `throttlé ${rateLimitPauses} fois d'affilée, abandon` });
      }

      const waitMs = waitMsFor(result);
      console.log(`  rate limited (${responseTimeMs}ms), pausing ${Math.round(waitMs / 1000)}s`);

      await sleep(waitMs);
      attempt -= 1;
      continue;
    }

    if (result.success && result.data) {
      pacer.onSuccess();

      const value = (result.data as QuotientFamilialData).quotient_familial?.valeur;

      if (typeof value !== "number") {
        return verdict({ value: null, error: "réponse sans quotient_familial.valeur" });
      }

      console.log(`  succès (${responseTimeMs}ms)`);

      // Proactive: the window is spent, so pause before the next row rather than
      // eating a wasted 429 on it.
      if (result.rateLimitRemaining === 0 && result.rateLimitResetMs != null) {
        console.log(`window exhausted, pausing ${Math.round(result.rateLimitResetMs / 1000)}s`);
        await sleep(result.rateLimitResetMs);
      }
      return verdict({ value, error: null });
    }

    // 404 "Erreur inattendue" is API instability, not an answer about the person:
    // back the cadence off, cool down, and burn an attempt. If it persists, the row is
    // left unsettled so the next run re-tries it — never recorded as non_trouve.
    if (isUnexpected404(result)) {
      pacer.onError();

      if (attempt === MAX_ATTEMPTS) {
        return verdict({ value: null, error: result.error ?? "Erreur inattendue (404)" });
      }

      console.log(`404 "Erreur inattendue" (${responseTimeMs}ms), cooldown ${INSTABILITY_COOLDOWN_MS / 1000}s`);
      await sleep(INSTABILITY_COOLDOWN_MS);
      continue;
    }

    // Any other 404 is a real answer — this person is not in the CAF/MSA base. Settled
    // as ineligible, so it is neither retried in-run nor re-called on the next run.
    if (result.httpStatus === 404) {
      pacer.onSuccess();
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
  row.qf_status === STATUS_FOUND ||
  row.qf_status === STATUS_NOT_FOUND ||
  row.qf_status === STATUS_NOT_FOUND_INSUFFICIENT_INFO;

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
  // A QF value settles the row; failing that, a 404 settles it as absent from the base, and
  // code 35560 as findable-but-undecidable; anything else leaves the status blank and is
  // picked up again on the next run.
  const status =
    verdict.value !== null
      ? STATUS_FOUND
      : verdict.notFound
        ? STATUS_NOT_FOUND
        : verdict.insufficientInfo
          ? STATUS_NOT_FOUND_INSUFFICIENT_INFO
          : "";
  return {
    qf_value: verdict.value === null ? "" : String(verdict.value),
    qf_status: status,
    qf_http_status: verdict.httpStatus == null ? "" : String(verdict.httpStatus),
    qf_error: verdict.error ?? "",
    qf_request_url: verdict.requestUrl ?? "",
  };
};

const VALUED_OPTIONS = ["--log-every", "--rate", "--night-rate", "--concurrency"];

const numberOption = (args: string[], name: string, fallback: number): number => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : Number(args[index + 1] ?? NaN);
};

// Skips the value that follows a valued option, otherwise `--rate 200` before the paths
// would make "200" the input file.
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

// A single call regularly takes over a second (see screenRow's own retries/pauses), so
// awaiting one row fully before starting the next would cap the real throughput at
// ~1/latency — far under the rate the pacer is asked to sustain. Rows are instead fanned
// out to up to CONCURRENCY in-flight settleRow() calls; pacer.acquire() (shared across all
// of them) is what actually enforces the target cadence, this just keeps enough calls
// in flight for that cadence to be reachable despite the per-call latency.
const DEFAULT_CONCURRENCY = 40;

// Runs `settle` over `items` with up to `concurrency` calls in flight, then commits each
// result through `write` in the original item order — the output CSV stays one row per
// input row in input order, which resume (hasVerdict/`done`) depends on, even though rows
// can settle out of order.
//
// Admission of new items is gated on the write backlog too, not just on in-flight settles:
// a settle's task resolves (freeing its concurrency slot) as soon as its result is handed
// off into `pending`, whether or not it was actually its turn to write — otherwise a single very
// slow row (a maintenance retry pauses up to 24h, see MAX_MAINTENANCE_PAUSES) would let
// unlimited later rows finish and pile up unwritten behind it, growing memory without bound
// on a multi-day run. Capping the backlog at a small multiple of `concurrency` keeps that
// bounded while still absorbing the ordinary latency spread between rows.
async function processInOrder<T, R>(
  items: AsyncIterable<T>,
  concurrency: number,
  settle: (item: T, sequence: number) => Promise<R>,
  write: (result: R) => Promise<void>,
): Promise<void> {
  const pending = new Map<number, R>();
  const inFlight = new Set<Promise<void>>();
  const backlogCap = concurrency * 4;
  let nextToWrite = 0;
  let nextToAdmit = 0;

  for await (const item of items) {
    const sequence = nextToAdmit++;

    const task = (async () => {
      const result = await settle(item, sequence);
      pending.set(sequence, result);

      while (pending.has(nextToWrite)) {
        const result = pending.get(nextToWrite)!;
        pending.delete(nextToWrite);
        await write(result);
        nextToWrite += 1;
      }
    })();

    const tracked = task.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);

    while (inFlight.size >= concurrency || pending.size >= backlogCap) {
      await Promise.race(inFlight);
    }
  }

  await Promise.all(inFlight);
}

// Mirrors `for await (const item of iterable) { if (++seen > count) yield item; }`, but also
// reports the total number of items seen (including the skipped ones) once the source is
// exhausted — the caller needs that count for its own end-of-run summary.
async function* skipFirst<T>(
  iterable: AsyncIterable<T>,
  count: number,
  seenCounter: { total: number },
): AsyncGenerator<T> {
  for await (const item of iterable) {
    seenCounter.total += 1;
    if (seenCounter.total > count) yield item;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [inputPath, outputPath] = positionalArgs(args);

  // A line per row is fine for a few hundred rows, but floods the log on a
  // multi-day, large-volume run — only print one line every N rows then.
  const logEvery = numberOption(args, "--log-every", 1);
  const ratePerMinute = numberOption(args, "--rate", DEFAULT_RATE_PER_MINUTE);
  const nightRatePerMinute = numberOption(args, "--night-rate", DEFAULT_NIGHT_RATE_PER_MINUTE);
  const concurrency = numberOption(args, "--concurrency", DEFAULT_CONCURRENCY);

  const invalidOption = [logEvery, ratePerMinute, nightRatePerMinute, concurrency].some(
    (value) => Number.isNaN(value) || value < 1,
  );

  if (!inputPath || !outputPath || invalidOption) {
    console.error(
      "usage: qf-batch <input.csv> <output.csv> [--log-every 1] " +
        `[--rate ${DEFAULT_RATE_PER_MINUTE}] [--night-rate ${DEFAULT_NIGHT_RATE_PER_MINUTE}] ` +
        `[--concurrency ${DEFAULT_CONCURRENCY}]`,
    );
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
  const pacer = new AdaptiveRatePacer({
    dayRatePerMinute: ratePerMinute,
    nightRatePerMinute: nightRatePerMinute,
    onRateChange: (change) => console.log(`  ${formatRateChange(change)}`),
  });
  const outColumns = [...header, ...ADDED_COLUMNS];

  let settled = 0;

  // Settles one row: no API call when the pivot is unusable, otherwise the QF chain.
  const settle = async (row: Record<string, string>, label: string) => {
    const identity = rowToIdentity(row);
    const verdict: Verdict = identity
      ? await screenRow(client, identity, pacer)
      : {
          value: null,
          error:
            "identité pivot incomplète (allocataire-nom_naissance/allocataire-date_naissance/" +
            "allocataire-code_pays_naissance)",
        };

    const columns = verdictColumns(verdict);
    settled += 1;

    if (settled % logEvery === 0) {
      console.log(
        `${label}: ${verdict.value ?? "aucun verdict"}` +
          (columns.qf_status === "" ? ` (${verdict.error})` : ` -> qf_status=${columns.qf_status}`) +
          (verdict.responseTimeMs != null ? ` [${verdict.responseTimeMs}ms]` : ""),
      );
    }

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

  // Rows already written: keep the settled ones, redo the rest. Re-settling is fanned out
  // (see processInOrder above) so a slow/retrying row does not stall the ones after it — the
  // write still lands rows on `stringifier` in their original order.
  if (existsSync(outputPath)) {
    await processInOrder(
      readOutputRows(outputPath),
      concurrency,
      async (row, sequence) => {
        done += 1;
        if (hasVerdict(row)) return { row, columns: row };

        called += 1;
        const columns = await settle(row, `reprise ligne ${sequence + 1}`);
        return { row, columns };
      },
      ({ row, columns }) => record(row, columns),
    );

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

  // Input rows never reached. Same fan-out as the resume pass above, restarted fresh (a
  // 0-based sequence, since skipFirst re-numbers what it yields) so it resumes appending
  // right where the resume pass left off in `stringifier`.
  const parser = createReadStream(inputPath).pipe(
    parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }),
  ) as AsyncIterable<Record<string, string>>;

  const seenCounter = { total: 0 };

  await processInOrder(
    skipFirst(parser, done, seenCounter),
    concurrency,
    async (row, sequence) => {
      called += 1;
      const columns = await settle(row, `ligne ${done + sequence + 1}`);
      return { row, columns };
    },
    ({ row, columns }) => record(row, columns),
  );

  const index = seenCounter.total;

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
