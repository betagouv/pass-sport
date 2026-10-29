// Mails their code_direct_aah to the AAH beneficiaries run_aah_direct.sh
// (data/2026/support-pipeline/) just coded. Touches no database and no queue: the journal is the
// only record of what went out.
//
//   pnpm codes:aah-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run]
//   pnpm codes:aah-emails --check-config       # key + code_direct_aah template
//
// The CSV header is id;code;email;nom;prenom;date_naissance.
//
// Replaying the same journal skips every id already 'envoye'. Exits 1 when a mail ends 'refuse' or
// 'erreur', and before sending anything on a bad CSV or configuration.

import "../load-env";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { isTerminalEmailError, LinkMobilityHttpError, type SendEmailResult } from "../email/link-mobility";
import { codeEmailVariables, type EmailVariables, sendOutcomeEmail, templateIdFor } from "../email/notify";

const DEFAULT_DELAY_MIN = 30;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 15_000;
const RATE_LIMIT_CODE = "63";

// Column for column: what run_aah_direct.sh writes.
const RECIPIENT_COLUMNS = ["id", "code", "email", "nom", "prenom", "date_naissance"] as const;

const KIND = "code_direct_aah";

export const JOURNAL_COLUMNS = [
  "id",
  "email",
  "statut",
  "campaign_id",
  "codes_erreur",
  "message",
  "horodatage",
] as const;

export type Recipient = Record<(typeof RECIPIENT_COLUMNS)[number], string>;

export type Statut = "envoye" | "refuse" | "erreur" | "simule";

export type JournalEntry = Record<(typeof JOURNAL_COLUMNS)[number], string> & { statut: Statut };

export type Outcome = Pick<JournalEntry, "statut" | "campaign_id" | "codes_erreur" | "message">;

export type Send = (recipient: string, vars: EmailVariables) => Promise<SendEmailResult>;

export type Bilan = Record<"envoyes" | "refuses" | "erreurs" | "deja_envoyes" | "simules", number>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const checkHeader = (header: string[]): string[] => {
  const known =
    RECIPIENT_COLUMNS.length === header.length &&
    RECIPIENT_COLUMNS.every((column, index) => column === header[index]);

  if (!known) {
    throw new Error(`en-tête "${header.join(";")}" inattendu, attendu "${RECIPIENT_COLUMNS.join(";")}"`);
  }
  return header;
};

export const parseRecipients = (text: string): Recipient[] => {
  const rows = parse(text, {
    columns: checkHeader,
    delimiter: ";",
    bom: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const ids = new Set<string>();

  return rows.map((row, index) => {
    const line = index + 2;
    const missing = RECIPIENT_COLUMNS.filter((column) => !row[column]);

    if (missing.length > 0) throw new Error(`ligne ${line} : champ(s) vide(s) ${missing.join(", ")}`);
    if (!ISO_DATE.test(row.date_naissance)) {
      throw new Error(`ligne ${line} : date_naissance "${row.date_naissance}" n'est pas AAAA-MM-JJ`);
    }
    if (ids.has(row.id)) throw new Error(`ligne ${line} : id ${row.id} en double`);
    ids.add(row.id);

    return Object.fromEntries(RECIPIENT_COLUMNS.map((column) => [column, row[column]])) as Recipient;
  });
};

export const sentIds = (journalText: string): Set<string> => {
  const rows = parse(journalText, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
  }) as Partial<JournalEntry>[];

  return new Set(rows.filter((row) => row.statut === "envoye").map((row) => row.id ?? ""));
};

export const recipientVariables = (recipient: Recipient): EmailVariables =>
  codeEmailVariables(
    KIND,
    { firstname: recipient.prenom, lastname: recipient.nom, birthdate: recipient.date_naissance },
    {},
    recipient.code,
  );

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
export const deliver = async (
  recipient: Recipient,
  send: Send,
  options: { maxAttempts?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Outcome> => {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  for (let attempt = 1; ; attempt += 1) {
    const retry = attempt < maxAttempts;

    let result: SendEmailResult;
    try {
      result = await send(recipient.email, recipientVariables(recipient));
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

export const run = async (
  recipients: Recipient[],
  options: {
    alreadySent: Set<string>;
    dryRun: boolean;
    send: Send;
    record: (entry: JournalEntry) => void;
    now?: () => Date;
    deliverOptions?: Parameters<typeof deliver>[2];
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
      ? outcome("simule", { message: JSON.stringify(recipientVariables(recipient)) })
      : await deliver(recipient, options.send, options.deliverOptions);

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

const USAGE =
  "Usage: pnpm codes:aah-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run] | --check-config";

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

// Throws when the key or template is missing, so a send stops before its first mail rather than
// journaling an 'erreur' per row.
const checkConfig = (): number => {
  if (!process.env.LINK_MOBILITY_API_KEY) throw new Error("LINK_MOBILITY_API_KEY is not set");
  return templateIdFor(KIND);
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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--check-config")) {
    console.log(`[pass-sport-worker] ${KIND} : gabarit ${checkConfig()}, clé Link Mobility présente`);
    return;
  }

  const input = readInput(argv);
  const journalPath = readOption(argv, "--journal");
  if (!input || !journalPath) throw new Error(USAGE);

  const dryRun = argv.includes("--dry-run");
  const delayMinutes = readDelayMinutes(argv);
  const sendAt = delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : undefined;

  const recipients = parseRecipients(readFileSync(input, "utf-8"));
  const templateId = checkConfig();
  const alreadySent = existsSync(journalPath)
    ? sentIds(readFileSync(journalPath, "utf-8"))
    : new Set<string>();

  console.log(
    `[pass-sport-worker] ${recipients.length} destinataire(s), ${
      sendAt ? `programmé pour ${sendAt.toISOString()}` : "immédiat"
    }${dryRun ? " — DRY-RUN, aucun appel Link Mobility" : ""}`,
  );
  console.log(`  ${KIND} (gabarit ${templateId}) : ${recipients.length}`);

  const bilan = await run(recipients, {
    alreadySent,
    dryRun,
    send: (to, vars) => sendOutcomeEmail(to, vars, sendAt),
    record: openJournal(journalPath),
  });

  console.log(
    `bilan : ${Object.entries(bilan)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")}`,
  );

  if (bilan.refuses + bilan.erreurs > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[pass-sport-worker] ${(error as Error).message}`);
    process.exit(1);
  });
}
