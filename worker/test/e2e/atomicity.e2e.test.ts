import { afterAll, beforeAll, expect, it, describe } from "vitest";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";

// No RESULT is persisted until every external call has answered.
//
// The failure modelled here is a chain that blows up partway through: some API Particulier
// resources answered, one did not. The job fails, eligibility_results is untouched — no
// half-batch of verdicts built on a partial reading of someone's situation — and the retry
// replays from the checkpoint.
//
// eligibility_history is the deliberate exception — it is written outside the
// transaction precisely so a run that ends this way still explains itself.

let stack: Stack;

beforeAll(async () => {
  // The 2nd API Particulier call answers 502: the first resource is read, the next is not.
  stack = await startStack({ apiFailOnCall: 2 });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const rows = async () => (await stack.pool.query("select * from eligibility_results")).rows;

const history = async () =>
  (await stack.pool.query("select * from eligibility_history order by created_at, id")).rows;

describe("a failed batch leaves no result", () => {
  it("writes nothing when an API Particulier call fails partway through", async () => {
    // CROUS makes the connected adult a beneficiary, AEEH pulls the QF children in —
    // so more than one resource is read and there is an ordering to break.
    const input = {
      identity: {
        family_name: "Martin",
        given_name: "Camille",
        birthdate: "2004-05-15",
        gender: "female" as const,
        birthplace: "75056",
        birthcountry: "99100",
        email: "camille.martin@example.test",
        sub: "sub-atomicity-1",
      },
      aides: ["CROUS", "AEEH"] as Array<"AAH" | "CROUS" | "AEEH">,
      isFranceConnected: true,
    };

    const reason = await stack.enqueueAndWaitFailure(input);
    expect(reason).toContain("API Particulier");

    // The whole point: not one row, not even for the resource that answered.
    expect(await rows()).toHaveLength(0);

    // The accusé de réception is the one mail that stands: it acknowledges the demande and
    // promises no verdict, so a failed chain does not make it wrong.
    expect(stack.parsedEmails().map((e) => e.templateId)).toEqual([
      String(TEMPLATE_IDS.acknowledgment),
    ]);

    // And the site sees no application for that pseudonym, so it still lets them
    // through and the retry is not treated as a duplicate.
    const seen = await stack.pool.query("select * from applications_by_sub where sub = $1", [
      input.identity.sub,
    ]);
    expect(seen.rows).toHaveLength(0);
  });

  // The whole point of writing history outside the transaction: this is the run you
  // most need to explain, and it is the one that used to leave nothing behind.
  it("still records the trace, including the failed call", async () => {
    const events = await history();
    expect(events.length).toBeGreaterThan(0);

    const failure = events.find((e) => e.actor === "api_particulier" && e.status === "error");
    expect(failure).toBeDefined();
    expect(failure.http_status).toBe(502);

    // The call that DID answer before it is there too — that ordering is the
    // diagnostic value.
    expect(events.some((e) => e.actor === "api_particulier" && e.status === "success")).toBe(true);

    // But nothing claims a result was written, because none was.
    expect(events.some((e) => e.action === "results.persisted")).toBe(false);
  });
});
