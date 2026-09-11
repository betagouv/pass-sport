import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack, TEMPLATE_IDS } from "./harness";

// The second pass of eligible_pending_lca_checks: mailing their code to the FranceConnect
// beneficiaries who now hold one. What every test here is really about is that a code goes out
// ONCE — the pass runs every 30 minutes over a table that keeps the rows it has already served.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
  // Defeat both cooldowns: these tests run several passes back to back, and a row touched one
  // millisecond ago must still be re-selectable.
  process.env.LCA_CHECKS_COOLDOWN_MIN = "0";
  process.env.FC_CODE_EMAIL_COOLDOWN_MIN = "0";
}, 180_000);

afterAll(async () => {
  delete process.env.LCA_CHECKS_COOLDOWN_MIN;
  delete process.env.FC_CODE_EMAIL_COOLDOWN_MIN;
  await stack?.close();
});

afterEach(async () => {
  // The selection is global, so a leftover row would be picked up by the next pass.
  await stack.pool.query("delete from eligibility_results");
  await stack.pool.query("delete from eligibility_history");
  stack.sentEmails().length = 0;
  stack.setEmailHttpStatus(null);
  stack.setEmailErreurs(null);
  stack.setLcaConfirmCode(null);
  delete process.env.FC_CODE_EMAIL_MAX_ATTEMPTS;
  delete process.env.FC_CODE_EMAIL_DELAY_MIN;
});

type MailRow = {
  email_sent: boolean;
  email_sent_at: Date | null;
  email_kind: string | null;
  email_attempts: number;
};

const readMailRow = async (id: string): Promise<MailRow> => {
  const { rows } = await stack.pool.query<MailRow>(
    "select email_sent, email_sent_at, email_kind, email_attempts from eligibility_results where id = $1",
    [id],
  );
  return rows[0];
};

const historyActions = async (): Promise<string[]> => {
  const { rows } = await stack.pool.query<{ action: string }>(
    "select action from eligibility_history order by created_at, action",
  );
  return rows.map((r) => r.action);
};

// The state data/writeback_confirmed.sql leaves behind: confirmed, holding a code, never mailed.
const seedConfirmed = (
  seed: Parameters<Stack["seedPendingLcaRow"]>[0],
): ReturnType<Stack["seedPendingLcaRow"]> =>
  stack.seedPendingLcaRow({ verdict: "eligible_confirmed", ...seed });

describe("fc code emails", () => {
  it("mails the code once, with the template the situation names", async () => {
    const id = await seedConfirmed({ sub: "sub-aah", code: "PSP-AAH", situation: "AAH" });

    await stack.enqueueLcaChecksAndWait();

    const [mail] = stack.parsedEmails();
    expect(mail.templateId).toBe(String(TEMPLATE_IDS.code_direct_aah));
    expect(mail.recipients).toEqual(["sub-aah@example.test"]);
    expect(mail.variables["sub-aah@example.test"].CODE).toBe("PSP-AAH");

    expect(await readMailRow(id)).toMatchObject({
      email_sent: true,
      email_kind: "code_direct_aah",
      email_attempts: 1,
    });
    expect((await readMailRow(id)).email_sent_at).not.toBeNull();
  });

  it("programs the mail half an hour out, unless the delay is set to 0", async () => {
    await seedConfirmed({ sub: "sub-delay", code: "PSP-DELAY", situation: "AAH" });
    const floor = Math.floor((Date.now() + 30 * 60_000) / 1000);

    await stack.enqueueLcaChecksAndWait();

    const scheduled = stack.parsedEmails()[0].sendAt ?? 0;
    expect(scheduled).toBeGreaterThanOrEqual(floor);
    expect(scheduled).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30 * 60);

    process.env.FC_CODE_EMAIL_DELAY_MIN = "0";
    await seedConfirmed({ sub: "sub-now", code: "PSP-NOW", situation: "AAH" });

    await stack.enqueueLcaChecksAndWait();

    // No `date` at all rather than a past one: that is what an immediate send looks like.
    expect(stack.parsedEmails()[1].sendAt).toBeNull();
  });

  it("mails a child's code to the allocataire, on the indirect template", async () => {
    await seedConfirmed({
      sub: "sub-qf",
      code: "PSP-QF",
      source: "enfant",
      situation: "QF",
      lastname: "ZALQUIN",
      firstname: "Fenrys",
      birthdate: "2015-06-02",
    });

    await stack.enqueueLcaChecksAndWait();

    const [mail] = stack.parsedEmails();
    expect(mail.templateId).toBe(String(TEMPLATE_IDS.code_indirect));
    expect(mail.variables["sub-qf@example.test"]).toMatchObject({
      BENEFICIAIRE_PRENOM: "Fenrys",
      BENEFICIAIRE_NOM: "Zalquin",
      ALLOCATAIRE_PRENOM: "Fenrys",
      CODE: "PSP-QF",
    });
  });

  // The point of the whole feature.
  it("does not mail the same beneficiary twice across two passes", async () => {
    const id = await seedConfirmed({ sub: "sub-once", code: "PSP-ONCE", situation: "boursier" });

    await stack.enqueueLcaChecksAndWait();
    await stack.enqueueLcaChecksAndWait();

    expect(stack.sentEmails()).toHaveLength(1);
    expect(await readMailRow(id)).toMatchObject({ email_sent: true, email_attempts: 1 });
  });

  // The parcours hors FranceConnect names its template at insert time and mails inline. A null
  // email_kind is what tells the two paths apart, so a row carrying one is not ours to serve.
  it("never touches a row from the parcours hors FranceConnect", async () => {
    const id = await seedConfirmed({
      sub: "sub-hors-fc",
      code: "PSP-HORS-FC",
      situation: "AAH",
      emailKind: "code_direct_aah",
    });

    await stack.enqueueLcaChecksAndWait();

    expect(stack.sentEmails()).toHaveLength(0);
    expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 0 });
  });

  // AAH and the boursier routes are indistinguishable without the column, and guessing would mail
  // the wrong text to a real person.
  it("refuses to guess a template for a self row written before the situation column", async () => {
    const id = await seedConfirmed({ sub: "sub-blind", code: "PSP-BLIND", situation: undefined });

    await stack.enqueueLcaChecksAndWait();

    expect(stack.sentEmails()).toHaveLength(0);
    expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 0 });
    expect(await historyActions()).toContain("fc_code_emails.skipped");
  });

  it("mails a row confirmed by the LCA loop in the same pass", async () => {
    const id = await stack.seedPendingLcaRow({
      sub: "sub-chained",
      code: "PSP-CHAINED",
      situation: "AAH",
    });
    stack.setLcaConfirmCode(() => "PSP-CHAINED");

    await stack.enqueueLcaChecksAndWait();

    expect(stack.sentEmails()).toHaveLength(1);
    expect(await readMailRow(id)).toMatchObject({ email_sent: true, email_kind: "code_direct_aah" });
  });

  describe("when Link Mobility refuses", () => {
    // Rejections bound to the request itself. A fourth send would be refused the same way.
    it("stops replaying a row on a terminal error code", async () => {
      const id = await seedConfirmed({ sub: "sub-dead", code: "PSP-DEAD", situation: "AAH" });
      stack.setEmailErreurs("30");

      await stack.enqueueLcaChecksAndWait();
      await stack.enqueueLcaChecksAndWait();

      expect(stack.sentEmails()).toHaveLength(1);
      expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 3 });
      expect(await historyActions()).toContain("fc_code_emails.terminal");
    });

    // The one rejection a resend is the right answer to.
    it("replays a row rate-limited by Link Mobility", async () => {
      const id = await seedConfirmed({ sub: "sub-slow", code: "PSP-SLOW", situation: "AAH" });
      stack.setEmailErreurs("63");

      await stack.enqueueLcaChecksAndWait();
      expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 1 });

      stack.setEmailErreurs(null);
      await stack.enqueueLcaChecksAndWait();

      expect(stack.sentEmails()).toHaveLength(2);
      expect(await readMailRow(id)).toMatchObject({ email_sent: true, email_attempts: 2 });
    });

    // The gateway being down says nothing about the request, so the row stays replayable — up to
    // the ceiling, which is the only thing standing between a lasting outage and an endless retry.
    it("replays an unreachable gateway until the ceiling, then no longer selects the row", async () => {
      process.env.FC_CODE_EMAIL_MAX_ATTEMPTS = "2";
      const id = await seedConfirmed({ sub: "sub-down", code: "PSP-DOWN", situation: "AAH" });
      stack.setEmailHttpStatus(502);

      await stack.enqueueLcaChecksAndWait();
      await stack.enqueueLcaChecksAndWait();
      expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 2 });

      // Third pass: the row is past the ceiling and is not even selected, so the gateway coming
      // back up changes nothing on its own.
      stack.setEmailHttpStatus(null);
      await stack.enqueueLcaChecksAndWait();

      expect(stack.sentEmails()).toHaveLength(2);
      expect(await readMailRow(id)).toMatchObject({ email_sent: false, email_attempts: 2 });
    });
  });
});
