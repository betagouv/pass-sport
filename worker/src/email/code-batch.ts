// CSV of coded beneficiaries -> one Link Mobility mail each, journaled line by line. Shared by the
// one-shot code senders (send-code-direct-aah.ts, send-partner-code-emails.ts): they only differ by
// their CSV contract and by the merge variables a row turns into.
//
// Replaying the same journal skips every id already 'envoye'.

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { stringify } from "csv-stringify/sync";
import { parse } from "csv-parse/sync";
import { isTerminalEmailError, LinkMobilityHttpError, type SendEmailResult } from "./link-mobility";
import { type EmailKind, type EmailVariables, sendOutcomeEmail, templateIdFor } from "./notify";

const DEFAULT_DELAY_MIN = 30;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 15_000;
const RATE_LIMIT_CODE = "63";

export const JOURNAL_COLUMNS = [
  "id",
  "email",
  "statut",
  "campaign_id",
  "codes_erreur",
  "message",
  "horodatage",
] as const;

export type BatchRecipient = { id: string; email: string };

export type Statut = "envoye" | "refuse" | "erreur" | "simule";

export type JournalEntry = Record<(typeof JOURNAL_COLUMNS)[number], string> & { statut: Statut };

export type Outcome = Pick<JournalEntry, "statut" | "campaign_id" | "codes_erreur" | "message">;

export type Send = (recipient: string, vars: EmailVariables) => Promise<SendEmailResult>;

export type Bilan = Record<"envoyes" | "refuses" | "erreurs" | "deja_envoyes" | "simules", number>;

export type DeliverOptions = { maxAttempts?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> };

export const sentIds = (journalText: string): Set<string> => {
  const rows = parse(journalText, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
  }) as Partial<JournalEntry>[];

  return new Set(rows.filter((row) => row.statut === "envoye").map((row) => row.id ?? ""));
};

const outcome = (statut: Statut, fields: Partial<Outcome> = {}): Outcome => ({
  statut,
  campaign_id: "",
  codes_erreur: "",
  message: "",
  ...fields,
});

const isRetryableHttpStatus = (status: number): boolean => status === 429 || status >= 500;

/**
 * One recipient, retried only where Link Mobility said nothing went out: a rate-limit
 * rejection or an HTTP error status. A request with no answer at all (timeout, severed socket)
 * may have been delivered, so it is recorded as 'erreur' and left to the operator.
 */
export const deliver = async <R extends BatchRecipient>(
  recipient: R,
  send: Send,
  variables: (recipient: R) => EmailVariables,
  options: DeliverOptions = {},
): Promise<Outcome> => {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let attempt = 1; ; attempt += 1) {
    const retry = attempt < maxAttempts;

    let result: SendEmailResult;
    try {
      result = await send(recipient.email, variables(recipient));
    } catch (error) {
      if (error instanceof LinkMobilityHttpError && isRetryableHttpStatus(error.httpStatus) && retry) {
        await sleep(retryDelayMs * attempt);
        continue;
      }
      return outcome("erreur", { message: (error as Error).message });
    }

    if (result.sent) return outcome("envoye", { campaign_id: String(result.campaignId) });

    const rateLimited =
      result.errorCodes.includes(RATE_LIMIT_CODE) && !isTerminalEmailError(result.errorCodes);
    if (rateLimited && retry) {
      await sleep(retryDelayMs * attempt);
      continue;
    }

    return outcome("refuse", {
      codes_erreur: result.errorCodes.join(","),
      message: result.errorMessages.join(" | "),
    });
  }
};

export const run = async <R extends BatchRecipient>(
  recipients: R[],
  options: {
    alreadySent: Set<string>;
    dryRun: boolean;
    send: Send;
    variables: (recipient: R) => EmailVariables;
    record: (entry: JournalEntry) => void;
    now?: () => Date;
    deliverOptions?: DeliverOptions;
  },
): Promise<Bilan> => {
  const now = options.now ?? (() => new Date());
  const bilan: Bilan = { envoyes: 0, refuses: 0, erreurs: 0, deja_envoyes: 0, simules: 0 };
  const counter: Record<Statut, keyof Bilan> = {
    envoye: "envoyes",
    refuse: "refuses",
    erreur: "erreurs",
    simule: "simules",
  };

  for (const recipient of recipients) {
    if (options.alreadySent.has(recipient.id)) {
      bilan.deja_envoyes += 1;
      continue;
    }

    const result = options.dryRun
      ? outcome("simule", { message: JSON.stringify(options.variables(recipient)) })
      : await deliver(recipient, options.send, options.variables, options.deliverOptions);

    options.record({
      id: recipient.id,
      email: recipient.email,
      ...result,
      horodatage: now().toISOString(),
    });
    bilan[counter[result.statut]] += 1;
  }

  return bilan;
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

const OPTIONS_WITH_VALUE = ["--journal", "--in"];

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const readInput = (argv: string[]): string | undefined =>
  argv.find((arg, index) => !arg.startsWith("--") && !OPTIONS_WITH_VALUE.includes(argv[index - 1]));

const readDelayMinutes = (argv: string[]): number => {
  const raw = readOption(argv, "--in");
  if (raw === undefined) return DEFAULT_DELAY_MIN;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--in expects a positive number of minutes, got "${raw}"`);
  }
  return parsed;
};

// Throws when the key or a template is missing, so a send stops before its first mail rather
// than journaling an 'erreur' per row.
const checkConfig = (kinds: readonly EmailKind[]): Map<EmailKind, number> => {
  if (!process.env.LINK_MOBILITY_API_KEY) throw new Error("LINK_MOBILITY_API_KEY is not set");
  return new Map(kinds.map((kind) => [kind, templateIdFor(kind)]));
};

// Appended and flushed one line at a time: a run killed midway keeps every verdict it got.
const openJournal = (path: string): ((entry: JournalEntry) => void) => {
  const isNew = !existsSync(path) || statSync(path).size === 0;
  const fd = openSync(path, "a", 0o640);

  if (isNew) writeSync(fd, stringify([[...JOURNAL_COLUMNS]], { delimiter: ";" }));

  process.on("exit", () => closeSync(fd));

  return (entry) => {
    writeSync(fd, stringify([JOURNAL_COLUMNS.map((column) => entry[column])], { delimiter: ";" }));
    fsyncSync(fd);
  };
};

/**
 *   <script> <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run] | --check-config
 *
 * Exits 1 when a mail ends 'refuse' or 'erreur', and before sending anything on a bad CSV or
 * configuration.
 */
export async function runCodeEmailCli<R extends BatchRecipient>(config: {
  usage: string;
  kinds: readonly EmailKind[];
  parseRecipients: (text: string) => R[];
  kindOf: (recipient: R) => EmailKind;
  variables: (recipient: R) => EmailVariables;
}): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--check-config")) {
    for (const [kind, templateId] of checkConfig(config.kinds)) {
      console.log(`[pass-sport-worker] ${kind} : gabarit ${templateId}`);
    }
    console.log("[pass-sport-worker] clé Link Mobility présente");
    return;
  }

  const input = readInput(argv);
  const journalPath = readOption(argv, "--journal");
  if (!input || !journalPath) throw new Error(config.usage);

  const dryRun = argv.includes("--dry-run");
  const delayMinutes = readDelayMinutes(argv);
  const sendAt = delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : undefined;

  const recipients = config.parseRecipients(readFileSync(input, "utf-8"));
  const templates = checkConfig(config.kinds);
  const alreadySent = existsSync(journalPath)
    ? sentIds(readFileSync(journalPath, "utf-8"))
    : new Set<string>();

  console.log(
    `[pass-sport-worker] ${recipients.length} destinataire(s), ${
      sendAt ? `programmé pour ${sendAt.toISOString()}` : "immédiat"
    }${dryRun ? " — DRY-RUN, aucun appel Link Mobility" : ""}`,
  );
  for (const [kind, templateId] of templates) {
    const count = recipients.filter((recipient) => config.kindOf(recipient) === kind).length;
    console.log(`  ${kind} (gabarit ${templateId}) : ${count}`);
  }

  const bilan = await run(recipients, {
    alreadySent,
    dryRun,
    send: (to, vars) => sendOutcomeEmail(to, vars, sendAt),
    variables: config.variables,
    record: openJournal(journalPath),
  });

  console.log(
    `bilan : ${Object.entries(bilan)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")}`,
  );

  if (bilan.refuses + bilan.erreurs > 0) process.exitCode = 1;
}
