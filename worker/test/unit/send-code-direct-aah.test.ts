import { describe, expect, it } from "vitest";
import { LinkMobilityHttpError, type SendEmailResult } from "../../src/email/link-mobility";
import type { EmailVariables } from "../../src/email/notify";
import {
  deliver,
  type JournalEntry,
  parseRecipients,
  type Recipient,
  recipientVariables,
  run,
  sentIds,
} from "../../src/scripts/send-code-direct-aah";

const recipient = (over: Partial<Recipient> = {}): Recipient => ({
  id: "id-1",
  code: "26-ABCD-EFGH",
  email: "tozal@example.org",
  nom: "MERVIK",
  prenom: "Élyra",
  date_naissance: "2006-08-07",
  kind: "code_direct_aah",
  ...over,
});

const SUPPORT_HEADER =
  "id;code;email;nom;prenom;date_naissance;situation;allocataire_prenom;allocataire_nom";

// recipient()'s beneficiary, as the Grist + DN pipeline writes it.
const supportCsv = (...rows: [id: string, situation: string, allocataire?: string][]): string =>
  [
    SUPPORT_HEADER,
    ...rows.map(
      ([id, situation, allocataire = "DORVANE;quillan"]) =>
        `${id};26-ABCD-EFGH;tozal@example.org;MERVIK;Élyra;2006-08-07;${situation};${allocataire}`,
    ),
  ].join("\n");

const beneficiaryVariables = {
  BENEFICIAIRE_PRENOM: "Élyra",
  BENEFICIAIRE_NOM: "Mervik",
  DATE_NAISSANCE_BENEFICIAIRE: "07/08/2006",
  CODE: "26-ABCD-EFGH",
};

const accepted: SendEmailResult = { sent: true, httpStatus: 200, campaignId: 42 };

const rejected = (codes: string[]): SendEmailResult => ({
  sent: false,
  httpStatus: 200,
  errorCodes: codes,
  errorMessages: codes.map((code) => `erreur ${code}`),
});

// Answers in turn, the last one repeated; records every call.
const scriptedSend = (...answers: (SendEmailResult | Error)[]) => {
  const calls: { to: string; vars: EmailVariables }[] = [];
  const send = async (to: string, vars: EmailVariables): Promise<SendEmailResult> => {
    const answer = answers[Math.min(calls.length, answers.length - 1)];
    calls.push({ to, vars });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, send };
};

const noSleep = { sleep: async () => {}, retryDelayMs: 0 };

describe("parseRecipients", () => {
  it("reads the CSV aah_direct_pipeline.py writes, every row as code_direct_aah", () => {
    const rows = parseRecipients(
      "﻿id;code;email;nom;prenom;date_naissance\nid-1;26-ABCD-EFGH;tozal@example.org;MERVIK;Élyra;2006-08-07\n",
    );
    expect(rows).toEqual([recipient()]);
  });

  it.each([
    ["AAH", "code_direct_aah"],
    ["boursier", "code_direct_boursier"],
    ["AEEH", "code_indirect"],
    ["jeune", "code_indirect"],
  ])("reads the situation %s as %s", (situation, kind) => {
    expect(parseRecipients(supportCsv(["id-1", situation]))[0].kind).toBe(kind);
  });

  it("names the allocataire in code_indirect alone", () => {
    const [boursier, aeeh] = parseRecipients(supportCsv(["a", "boursier"], ["b", "AEEH"]));

    expect(recipientVariables(boursier)).toEqual({
      kind: "code_direct_boursier",
      ...beneficiaryVariables,
    });
    expect(recipientVariables(aeeh)).toEqual({
      kind: "code_indirect",
      ...beneficiaryVariables,
      ALLOCATAIRE_PRENOM: "Dorvane",
      ALLOCATAIRE_NOM: "Quillan",
    });
  });

  it("requires the allocataire on code_indirect rows only", () => {
    expect(() => parseRecipients(supportCsv(["id-1", "jeune", "DORVANE;"]))).toThrow(
      /ligne 2 : champ\(s\) vide\(s\) allocataire_nom/,
    );
    expect(parseRecipients(supportCsv(["id-1", "AAH", ";"]))).toEqual([recipient()]);
  });

  it("refuses an unknown situation", () => {
    expect(() => parseRecipients(supportCsv(["id-1", "aah"]))).toThrow(/situation "aah" inconnue/);
    expect(() => parseRecipients(supportCsv(["id-1", "QF"]))).toThrow(/situation "QF" inconnue/);
    expect(() => parseRecipients(supportCsv(["id-1", ""]))).toThrow(/situation "" inconnue/);
  });

  it("refuses any other header", () => {
    expect(() =>
      parseRecipients(
        "id;code;email;nom;prenom;date_naissance;situation\nid-1;C;a@example.org;N;P;2006-08-07;AAH\n",
      ),
    ).toThrow(/en-tête .* inattendu/);
    expect(() =>
      parseRecipients("id;email;code;nom;prenom;date_naissance\nid-1;a@example.org;C;N;P;2006-08-07\n"),
    ).toThrow(/en-tête .* inattendu/);
  });

  it("refuses a non-ISO birthdate", () => {
    expect(() =>
      parseRecipients("id;code;email;nom;prenom;date_naissance\nid-1;C;a@example.org;N;P;07/08/2006\n"),
    ).toThrow(/AAAA-MM-JJ/);
  });

  it("refuses an empty field and a duplicated id", () => {
    expect(() =>
      parseRecipients("id;code;email;nom;prenom;date_naissance\nid-1;;a@example.org;N;P;2006-08-07\n"),
    ).toThrow(/code/);
    expect(() =>
      parseRecipients(
        "id;code;email;nom;prenom;date_naissance\nid-1;C;a@example.org;N;P;2006-08-07\nid-1;D;b@example.org;N;P;2006-08-07\n",
      ),
    ).toThrow(/en double/);
  });
});

describe("sentIds", () => {
  it("keeps only the ids Link Mobility accepted", () => {
    const journal =
      "id;email;statut;campaign_id;codes_erreur;message;horodatage\n" +
      "a;a@example.org;envoye;1;;;t\nb;b@example.org;refuse;;4;x;t\nc;c@example.org;simule;;;{};t\n";
    expect(sentIds(journal)).toEqual(new Set(["a"]));
  });
});

describe("deliver", () => {
  it("sends the code_direct_aah merge fields", async () => {
    const { calls, send } = scriptedSend(accepted);

    expect(await deliver(recipient(), send, noSleep)).toMatchObject({
      statut: "envoye",
      campaign_id: "42",
    });
    expect(calls).toEqual([
      {
        to: "tozal@example.org",
        vars: {
          kind: "code_direct_aah",
          BENEFICIAIRE_PRENOM: "Élyra",
          BENEFICIAIRE_NOM: "Mervik",
          DATE_NAISSANCE_BENEFICIAIRE: "07/08/2006",
          CODE: "26-ABCD-EFGH",
        },
      },
    ]);
  });

  it("sends the code_indirect merge fields, allocataire included", async () => {
    const { calls, send } = scriptedSend(accepted);
    const indirect = recipient({
      kind: "code_indirect",
      allocataire_prenom: "DORVANE",
      allocataire_nom: "quillan",
    });

    expect((await deliver(indirect, send, noSleep)).statut).toBe("envoye");
    expect(calls[0].vars).toEqual({
      kind: "code_indirect",
      ...beneficiaryVariables,
      ALLOCATAIRE_PRENOM: "Dorvane",
      ALLOCATAIRE_NOM: "Quillan",
    });
  });

  it("retries a rate-limit rejection", async () => {
    const { calls, send } = scriptedSend(rejected(["63"]), accepted);
    expect((await deliver(recipient(), send, noSleep)).statut).toBe("envoye");
    expect(calls).toHaveLength(2);
  });

  it("retries an HTTP 5xx, but gives up after the last attempt", async () => {
    const { calls, send } = scriptedSend(new LinkMobilityHttpError(502));
    expect((await deliver(recipient(), send, { ...noSleep, maxAttempts: 3 })).statut).toBe("erreur");
    expect(calls).toHaveLength(3);
  });

  it("records a terminal rejection without retrying", async () => {
    const { calls, send } = scriptedSend(rejected(["4"]));
    expect(await deliver(recipient(), send, noSleep)).toMatchObject({
      statut: "refuse",
      codes_erreur: "4",
    });
    expect(calls).toHaveLength(1);
  });

  it("never retries a request left without an answer: it may have gone out", async () => {
    const { calls, send } = scriptedSend(new TypeError("fetch failed"));
    expect(await deliver(recipient(), send, noSleep)).toMatchObject({
      statut: "erreur",
      message: "fetch failed",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("run", () => {
  it("skips what the journal already holds and records the rest", async () => {
    const { calls, send } = scriptedSend(accepted, rejected(["4"]));
    const journal: JournalEntry[] = [];

    const bilan = await run(
      [recipient({ id: "a" }), recipient({ id: "b" }), recipient({ id: "c" })],
      { alreadySent: new Set(["a"]), dryRun: false, send, record: (e) => journal.push(e) },
    );

    expect(bilan).toEqual({ envoyes: 1, refuses: 1, erreurs: 0, deja_envoyes: 1, simules: 0 });
    expect(calls).toHaveLength(2);
    expect(journal.map((e) => [e.id, e.statut])).toEqual([
      ["b", "envoye"],
      ["c", "refuse"],
    ]);
  });

  it("calls nothing in dry run, and journals what would have gone out", async () => {
    const { calls, send } = scriptedSend(accepted);
    const journal: JournalEntry[] = [];

    const bilan = await run([recipient()], {
      alreadySent: new Set(),
      dryRun: true,
      send,
      record: (e) => journal.push(e),
    });

    expect(calls).toHaveLength(0);
    expect(bilan.simules).toBe(1);
    expect(journal[0].statut).toBe("simule");
    expect(JSON.parse(journal[0].message)).toMatchObject({ CODE: "26-ABCD-EFGH" });
  });

  it("journals each row with its own template in a mixed dry run", async () => {
    const { calls, send } = scriptedSend(accepted);
    const journal: JournalEntry[] = [];
    const recipients = parseRecipients(
      supportCsv(["a", "AAH"], ["b", "boursier"], ["c", "AEEH"], ["d", "jeune"]),
    );

    const bilan = await run(recipients, {
      alreadySent: new Set(["b"]),
      dryRun: true,
      send,
      record: (e) => journal.push(e),
    });

    expect(calls).toHaveLength(0);
    expect(bilan).toEqual({ envoyes: 0, refuses: 0, erreurs: 0, deja_envoyes: 1, simules: 3 });
    expect(journal.map((e) => [e.id, e.statut, JSON.parse(e.message).kind])).toEqual([
      ["a", "simule", "code_direct_aah"],
      ["c", "simule", "code_indirect"],
      ["d", "simule", "code_indirect"],
    ]);
    expect(JSON.parse(journal[0].message)).not.toHaveProperty("ALLOCATAIRE_PRENOM");
    expect(JSON.parse(journal[2].message)).toMatchObject({
      ALLOCATAIRE_PRENOM: "Dorvane",
      ALLOCATAIRE_NOM: "Quillan",
    });
  });
});
