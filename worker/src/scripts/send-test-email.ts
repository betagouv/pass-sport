// Sends one real mail through Link Mobility, scheduled a few minutes out. Touches no database and
// no queue.
//
//   pnpm email:test moi@example.org
//   pnpm email:test moi@example.org --in 5 --kind code_indirect
//   pnpm email:test moi@example.org --in 0            # immédiat

import "../load-env";
import { codeEmailVariables, type EmailVariables, sendOutcomeEmail } from "../email/notify";

const KINDS = [
  "code_direct_aah",
  "code_direct_boursier",
  "code_indirect",
  "not_eligible_hors_fc",
] as const;

type Kind = (typeof KINDS)[number];

const DEFAULT_KIND: Kind = "code_direct_boursier";
const DEFAULT_DELAY_MIN = 5;

const readOption = (argv: string[], name: string): string | undefined => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const readKind = (argv: string[]): Kind => {
  const raw = readOption(argv, "--kind");

  if (raw === undefined) return DEFAULT_KIND;

  if (!KINDS.includes(raw as Kind)) {
    throw new Error(`--kind expects one of ${KINDS.join(", ")}, got "${raw}"`);
  }

  return raw as Kind;
};

const readDelayMinutes = (argv: string[]): number => {
  const raw = readOption(argv, "--in");

  if (raw === undefined) return DEFAULT_DELAY_MIN;

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--in expects a positive number of minutes, got "${raw}"`);
  }

  return parsed;
};

const testVariables = (kind: Kind): EmailVariables =>
  kind === "not_eligible_hors_fc"
    ? { kind }
    : codeEmailVariables(
        kind,
        { firstname: "Test", lastname: "Bénéficiaire", birthdate: "2010-04-15" },
        { given_name: "Test", family_name: "Allocataire" },
        "TEST-CODE-0000",
      );

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const recipient = argv[0];

  if (!recipient?.includes("@")) {
    throw new Error("Usage: pnpm email:test <destinataire> [--in <minutes>] [--kind <kind>]");
  }

  const kind = readKind(argv);
  const delayMinutes = readDelayMinutes(argv);
  const sendAt = delayMinutes > 0 ? new Date(Date.now() + delayMinutes * 60_000) : undefined;

  console.log(
    `[pass-sport-worker] ${kind} → ${recipient} ${
      sendAt ? `programmé pour ${sendAt.toISOString()} (dans ${delayMinutes} min)` : "immédiat"
    }`,
  );

  const result = await sendOutcomeEmail(recipient, testVariables(kind), sendAt);

  if (!result.sent) {
    console.error(
      `[pass-sport-worker] refusé (HTTP ${result.httpStatus}): ${result.errorCodes.join(",")} — ${result.errorMessages.join("; ")}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[pass-sport-worker] accepté, campaign id ${result.campaignId}`);
}

main().catch((e) => {
  console.error(`[pass-sport-worker] ${(e as Error).message}`);
  process.exit(1);
});
