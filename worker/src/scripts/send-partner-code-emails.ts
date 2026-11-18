// Mails their code to the beneficiaries of a partner delivery coded outside the site, such as
// the CPS de Saint-Pierre-et-Miquelon file (data/2026/partners/spm/run_spm.sh). Each row names its
// template: code_direct_aah when the beneficiary is the allocataire, code_indirect when a parent
// reads the code minted for their child. Touches no database and no queue: the journal is the
// only record of what went out.
//
//   pnpm codes:partner-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run]
//   pnpm codes:partner-emails --check-config   # key + both templates
//
// The CSV header is id;kind;code;email;nom;prenom;date_naissance;allocataire_nom;allocataire_prenom.
// One address may appear on several rows (siblings): each row is its own mail, with its own code.

import "../load-env";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { runCodeEmailCli } from "../email/code-batch";
import { type CodeEmailKind, codeEmailVariables, type EmailVariables } from "../email/notify";

const RECIPIENT_COLUMNS = [
  "id",
  "kind",
  "code",
  "email",
  "nom",
  "prenom",
  "date_naissance",
  "allocataire_nom",
  "allocataire_prenom",
] as const;

export const KINDS = ["code_direct_aah", "code_indirect"] as const satisfies readonly CodeEmailKind[];

type PartnerKind = (typeof KINDS)[number];

// Only the indirect template names the allocataire.
const REQUIRED_COLUMNS: Record<PartnerKind, readonly (typeof RECIPIENT_COLUMNS)[number][]> = {
  code_direct_aah: ["id", "kind", "code", "email", "nom", "prenom", "date_naissance"],
  code_indirect: RECIPIENT_COLUMNS,
};

export type Recipient = Record<(typeof RECIPIENT_COLUMNS)[number], string> & { kind: PartnerKind };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isPartnerKind = (value: string): value is PartnerKind => (KINDS as readonly string[]).includes(value);

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

    if (!isPartnerKind(row.kind)) {
      throw new Error(`ligne ${line} : kind "${row.kind}" inconnu, attendu ${KINDS.join(" ou ")}`);
    }
    const missing = REQUIRED_COLUMNS[row.kind].filter((column) => !row[column]);

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
    recipient.kind,
    { firstname: recipient.prenom, lastname: recipient.nom, birthdate: recipient.date_naissance },
    { given_name: recipient.allocataire_prenom, family_name: recipient.allocataire_nom },
    recipient.code,
  );

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCodeEmailCli({
    usage:
      "Usage: pnpm codes:partner-emails <emails.csv> --journal <envois.csv> [--in <minutes>] [--dry-run] | --check-config",
    kinds: KINDS,
    parseRecipients,
    kindOf: (recipient) => recipient.kind,
    variables: recipientVariables,
  }).catch((error: unknown) => {
    console.error(`[pass-sport-worker] ${(error as Error).message}`);
    process.exit(1);
  });
}
