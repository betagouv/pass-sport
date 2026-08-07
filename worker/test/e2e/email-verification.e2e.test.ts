import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { CAISSE, SITUATION, type ApiParticulierJobPayload } from "../../src/eligibility/types";

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

beforeEach(async () => {
  await stack.pool.query("TRUNCATE email_verifications");
  await stack.pool.query("TRUNCATE eligibility_history");
  await stack.pool.query("TRUNCATE audit");
  stack.sentEmails().length = 0;
});

const verifications = async () =>
  (await stack.pool.query("select * from email_verifications order by created_at")).rows;

const historyActions = async (): Promise<string[]> =>
  (await stack.pool.query("select action from eligibility_history order by created_at")).rows.map(
    (r) => r.action as string,
  );

const request = (overrides: Partial<ApiParticulierJobPayload> = {}): ApiParticulierJobPayload => ({
  aide: SITUATION.QF,
  caisse: CAISSE.CAF,
  beneficiary: { lastname: "Martin", firstname: "Cadet", birthdate: "2012-01-01" },
  allocataire: {
    family_name: "Martin",
    given_name: "Claude",
    birthdate: "1980-03-02",
    gender: "female",
    birthplace: "75056",
    birthcountry: "99100",
    email: "claude.martin@example.test",
  },
  birthCountryIso: "FR",
  cafNumber: "1234567",
  residenceInsee: "75113",
  email: "claude.martin@example.test",
  ...overrides,
});

// The fake Link Mobility server receives an x-www-form-urlencoded body; the link sits in
// `message` (inline HTML mode, since no template id is configured in tests).
const tokenFromLastEmail = (): string => {
  const sent = stack.sentEmails();
  const body = new URLSearchParams(sent[sent.length - 1]);
  const message = `${body.get("message") ?? ""} ${body.get("alternatif") ?? ""}`;
  const match = message.match(/verification-email\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no verification link in the email body: ${message}`);
  return match[1];
};

describe("email verification", () => {
  it("parks the payload and mails a link", async () => {
    const result = (await stack.enqueueVerificationAndWait(request(), "job-hash-1")) as {
      sent: boolean;
      throttled: boolean;
    };

    expect(result.sent).toBe(true);
    expect(result.throttled).toBe(false);

    const stored = await verifications();
    expect(stored).toHaveLength(1);
    expect(stored[0].job_id).toBe("job-hash-1");
    expect(stored[0].consumed_at).toBeNull();

    // ~24h out, generously bounded so a slow container start cannot flake it.
    const ttlMs = new Date(stored[0].expires_at).getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(23 * 3600 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 3600 * 1000);

    // The payload is kept whole: it is what the click replays.
    expect(stored[0].payload).toMatchObject({ aide: "QF", email: "claude.martin@example.test" });

    expect(stack.sentEmails()).toHaveLength(1);
    expect(await historyActions()).toContain("email.verification.sent");
  });

  it("stores only the digest, never the token itself", async () => {
    await stack.enqueueVerificationAndWait(request(), "job-hash-2");

    const token = tokenFromLastEmail();
    const [stored] = await verifications();

    expect(stored.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    // The whole point: a read of the table cannot reconstruct a working link.
    expect(JSON.stringify(stored)).not.toContain(token);

    // Nor may the never-purged history table hold it.
    const history = await stack.pool.query("select payload from eligibility_history");
    expect(JSON.stringify(history.rows)).not.toContain(token);
  });

  it("throttles a second submission for the same job id", async () => {
    await stack.enqueueVerificationAndWait(request(), "job-hash-3");
    expect(stack.sentEmails()).toHaveLength(1);

    // A resubmission carries the SAME id — it is the identity hash, not a per-request value.
    // Production drops the completed job (removeOnComplete), which is what lets the id be
    // reused at all; the harness keeps it, so drop it by hand to reproduce that state.
    await (await stack.verificationQueue.getJob("job-hash-3"))?.remove();

    const result = (await stack.enqueueVerificationAndWait(request(), "job-hash-3")) as {
      sent: boolean;
      throttled: boolean;
    };

    expect(result.throttled).toBe(true);
    expect(result.sent).toBe(false);
    // Nothing new mailed, and no second row minted.
    expect(stack.sentEmails()).toHaveLength(1);
    expect(await verifications()).toHaveLength(1);
  });

  it("does not throttle a different job id", async () => {
    await stack.enqueueVerificationAndWait(request(), "job-hash-4");
    await stack.enqueueVerificationAndWait(
      request({ email: "autre@example.test" }),
      "job-hash-5",
    );

    expect(stack.sentEmails()).toHaveLength(2);
    expect(await verifications()).toHaveLength(2);
  });
});

// The consuming statement lives on the site (site/src/app/services/email-verification.ts),
// but the guarantee it rests on is in the schema, so it is pinned here against a real
// Postgres rather than mocked over there.
describe("token consumption", () => {
  const CONSUME = `
    UPDATE email_verifications
       SET consumed_at = now()
     WHERE token_hash = $1
       AND consumed_at IS NULL
       AND expires_at > now()
    RETURNING payload, job_id
  `;

  it("is single-use", async () => {
    await stack.enqueueVerificationAndWait(request(), "job-hash-6");
    const hash = createHash("sha256").update(tokenFromLastEmail()).digest("hex");

    const first = await stack.pool.query(CONSUME, [hash]);
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0].job_id).toBe("job-hash-6");
    expect(first.rows[0].payload).toMatchObject({ aide: "QF" });

    const second = await stack.pool.query(CONSUME, [hash]);
    expect(second.rows).toHaveLength(0);
  });

  it("refuses an expired token", async () => {
    await stack.enqueueVerificationAndWait(request(), "job-hash-7");
    const hash = createHash("sha256").update(tokenFromLastEmail()).digest("hex");

    await stack.pool.query(
      "update email_verifications set expires_at = now() - interval '1 minute' where token_hash = $1",
      [hash],
    );

    const consumed = await stack.pool.query(CONSUME, [hash]);
    expect(consumed.rows).toHaveLength(0);

    // Still unconsumed, so the site can tell "expired" from "already used".
    const [stored] = await verifications();
    expect(stored.consumed_at).toBeNull();
  });

  it("refuses an unknown token", async () => {
    const consumed = await stack.pool.query(CONSUME, [
      createHash("sha256").update("never-issued").digest("hex"),
    ]);
    expect(consumed.rows).toHaveLength(0);
  });
});
