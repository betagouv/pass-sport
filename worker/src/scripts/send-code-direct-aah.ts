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
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import * as batch from "../email/code-batch";
import { codeEmailVariables, type EmailVariables } from "../email/notify";

export { type Bilan, type JournalEntry, type Outcome, type Send, sentIds, type Statut } from "../email/code-batch";

// Column for column: what run_aah_direct.sh writes.
const RECIPIENT_COLUMNS = ["id", "code", "email", "nom", "prenom", "date_naissance"] as const;

const KIND = "code_direct_aah";

export type Recipient = Record<(typeof RECIPIENT_COLUMNS)[number], string>;

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

export const recipientVariables = (recipient: Recipient): EmailVariables =>
  codeEmailVariables(
    KIND,
    { firstname: recipient.prenom, lastname: recipient.nom, birthdate: recipient.date_naissance },
    {},
    recipient.code,
  );

export const deliver = (
  recipient: Recipient,
  send: batch.Send,
  options: batch.DeliverOptions = {},
): Promise<batch.Outcome> => batch.deliver(recipient, send, recipientVariables, options);

export const run = (
  recipients: Recipient[],
  options: Omit<Parameters<typeof batch.run<Recipient>>[1], "variables">,
): Promise<batch.Bilan> => batch.run(recipients, { ...options, variables: recipientVariables });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  batch
    .runCodeEmailCli({
      usage:
        "Usage: pnpm codes:aah-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run] | --check-config",
      kinds: [KIND],
      parseRecipients,
      kindOf: () => KIND,
      variables: recipientVariables,
    })
    .catch((error: unknown) => {
      console.error(`[pass-sport-worker] ${(error as Error).message}`);
      process.exit(1);
    });
}
