// Mails their code to the beneficiaries a support pipeline just coded: run_aah_direct.sh
// (data/2026/support-pipeline/) for AAH alone, the Grist + Démarches Numériques pipeline for every
// situation. Touches no database and no queue: the journal is the only record of what went out.
//
//   pnpm codes:aah-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run]
//   pnpm codes:aah-emails --check-config       # key + code_direct_aah template
//   pnpm codes:support-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run]
//   pnpm codes:support-emails --check-config   # key + the three code templates
//
// codes:support-emails is this script with --all-kinds, which only widens --check-config: a send
// checks the templates its own rows use, whichever name runs it.
//
// The CSV header is id;code;email;nom;prenom;date_naissance, every row then mailing
// code_direct_aah, or the same followed by situation;allocataire_prenom;allocataire_nom. situation
// (AAH, boursier, AEEH or jeune) picks the template; AEEH and jeune mail code_indirect, which names
// the allocataire and so requires both of their columns.
//
// Replaying the same journal skips every id already 'envoye'. Exits 1 when a mail ends 'refuse' or
// 'erreur', and before sending anything on a bad CSV or configuration.

import "../load-env";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, statSync, writeSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { isTerminalEmailError, LinkMobilityHttpError, type SendEmailResult } from "../email/link-mobility";
import {
  type CodeEmailKind,
  codeEmailVariables,
  type EmailVariables,
  sendOutcomeEmail,
  templateIdFor,
} from "../email/notify";

const DEFAULT_DELAY_MIN = 30;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 15_000;
const RATE_LIMIT_CODE = "63";

const RECIPIENT_COLUMNS = ["id", "code", "email", "nom", "prenom", "date_naissance"] as const;
const ALLOCATAIRE_COLUMNS = ["allocataire_prenom", "allocataire_nom"] as const;

// Column for column: what run_aah_direct.sh writes, and what the Grist + DN pipeline writes.
const HEADERS: readonly (readonly string[])[] = [
  RECIPIENT_COLUMNS,
  [...RECIPIENT_COLUMNS, "situation", ...ALLOCATAIRE_COLUMNS],
];

// lamp01's public.situation enum. codeEmailKindForAide reads ResultSituation instead, where 'jeune'
// is 'QF', and sends whatever it does not know to the boursier template.
const KIND_BY_SITUATION = new Map<string, CodeEmailKind>([
  ["AAH", "code_direct_aah"],
  ["boursier", "code_direct_boursier"],
  ["AEEH", "code_indirect"],
  ["jeune", "code_indirect"],
]);

// Every row of a CSV without the situation column.
const DEFAULT_KIND: CodeEmailKind = "code_direct_aah";
const ALL_KINDS = [...new Set(KIND_BY_SITUATION.values())];

export const JOURNAL_COLUMNS = [
  "id",
  "email",
  "statut",
  "campaign_id",
  "codes_erreur",
  "message",
  "horodatage",
] as const;

export type Recipient = Record<(typeof RECIPIENT_COLUMNS)[number], string> & {
  kind: CodeEmailKind;
  // code_indirect alone: its reader is the allocataire, the parent of the beneficiary.
  allocataire_prenom?: string;
  allocataire_nom?: string;
};

export type Statut = "envoye" | "refuse" | "erreur" | "simule";

export type JournalEntry = Record<(typeof JOURNAL_COLUMNS)[number], string> & { statut: Statut };

export type Outcome = Pick<JournalEntry, "statut" | "campaign_id" | "codes_erreur" | "message">;

export type Send = (recipient: string, vars: EmailVariables) => Promise<SendEmailResult>;

export type Bilan = Record<"envoyes" | "refuses" | "erreurs" | "deja_envoyes" | "simules", number>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const checkHeader = (header: string[]): string[] => {
  const known = HEADERS.some(
    (columns) =>
      columns.length === header.length && columns.every((column, index) => column === header[index]),
  );

  if (!known) {
    const expected = HEADERS.map((columns) => `"${columns.join(";")}"`).join(" ou ");
    throw new Error(`en-tête "${header.join(";")}" inattendu, attendu ${expected}`);
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
    const kind = row.situation === undefined ? DEFAULT_KIND : KIND_BY_SITUATION.get(row.situation);

    if (!kind) {
      const expected = [...KIND_BY_SITUATION.keys()].join(", ");
      throw new Error(`ligne ${line} : situation "${row.situation}" inconnue, attendu ${expected}`);
    }

    const columns: readonly string[] =
      kind === "code_indirect" ? [...RECIPIENT_COLUMNS, ...ALLOCATAIRE_COLUMNS] : RECIPIENT_COLUMNS;
    const missing = columns.filter((column) => !row[column]);

    if (missing.length > 0) throw new Error(`ligne ${line} : champ(s) vide(s) ${missing.join(", ")}`);
    if (!ISO_DATE.test(row.date_naissance)) {
      throw new Error(`ligne ${line} : date_naissance "${row.date_naissance}" n'est pas AAAA-MM-JJ`);
    }
    if (ids.has(row.id)) throw new Error(`ligne ${line} : id ${row.id} en double`);
    ids.add(row.id);

    return { ...Object.fromEntries(columns.map((column) => [column, row[column]])), kind } as Recipient;
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
    recipient.kind,
    { firstname: recipient.prenom, lastname: recipient.nom, birthdate: recipient.date_naissance },
    { given_name: recipient.allocataire_prenom, family_name: recipient.allocataire_nom },
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
  "Usage: pnpm codes:aah-emails|codes:support-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run] | --check-config";

const OPTIONS_WITH_VALUE = ["--journal", "--in"];

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

// Not argv[0]: codes:support-emails puts --all-kinds ahead of the caller's arguments.
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

// Throws on the first template missing, so a send stops before its first mail rather than
// journaling an 'erreur' per row.
const checkConfig = (kinds: Iterable<CodeEmailKind>): Map<CodeEmailKind, number> => {
  if (!process.env.LINK_MOBILITY_API_KEY) throw new Error("LINK_MOBILITY_API_KEY is not set");
  return new Map(Array.from(kinds, (kind) => [kind, templateIdFor(kind)] as const));
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
    const templateIds = checkConfig(argv.includes("--all-kinds") ? ALL_KINDS : [DEFAULT_KIND]);
    const templates = [...templateIds].map(([kind, templateId]) => `${kind} : gabarit ${templateId}`);
    console.log(`[pass-sport-worker] ${templates.join(", ")}, clé Link Mobility présente`);
    return;
  }

  const input = readInput(argv);
  const journalPath = readOption(argv, "--journal");
  if (!input || !journalPath) throw new Error(USAGE);

  const dryRun = argv.includes("--dry-run");
  const delayMinutes = readDelayMinutes(argv);
  const sendAt = delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : undefined;

  const recipients = parseRecipients(readFileSync(input, "utf-8"));
  const perKind = new Map<CodeEmailKind, number>();
  for (const { kind } of recipients) perKind.set(kind, (perKind.get(kind) ?? 0) + 1);

  const templateIds = checkConfig(perKind.keys());
  const alreadySent = existsSync(journalPath)
    ? sentIds(readFileSync(journalPath, "utf-8"))
    : new Set<string>();

  console.log(
    `[pass-sport-worker] ${recipients.length} destinataire(s), ${
      sendAt ? `programmé pour ${sendAt.toISOString()}` : "immédiat"
    }${dryRun ? " — DRY-RUN, aucun appel Link Mobility" : ""}`,
  );
  for (const [kind, templateId] of templateIds) {
    console.log(`  ${kind} (gabarit ${templateId}) : ${perKind.get(kind)}`);
  }

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
