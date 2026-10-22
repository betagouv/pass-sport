import { describe, expect, it } from "vitest";
import { LinkMobilityHttpError, type SendEmailResult } from "../../src/email/link-mobility";
import type { EmailVariables } from "../../src/email/notify";
import {
  deliver,
  type JournalEntry,
  parseRecipients,
  type Recipient,
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
  ...over,
});

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
  it("reads the CSV aah_direct_pipeline.py writes", () => {
    const rows = parseRecipients(
      "﻿id;code;email;nom;prenom;date_naissance\nid-1;26-ABCD-EFGH;tozal@example.org;MERVIK;Élyra;2006-08-07\n",
    );
    expect(rows).toEqual([recipient()]);
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
});
