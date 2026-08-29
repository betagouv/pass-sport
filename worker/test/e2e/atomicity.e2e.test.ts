import { afterAll, beforeAll, expect, it, describe } from "vitest";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";

// No RESULT is persisted until every external call has answered.
//
// The failure modelled here is the one that used to corrupt the record: a batch of
// several beneficiaries where an LCA call blows up partway through. The old loop had
// already inserted rows, and mailed codes, for the beneficiaries it had gone past. Now the
// batch is all-or-nothing: the job fails, eligibility_results is untouched, no verdict was
// mailed, and the retry replays from a clean slate.
//
// eligibility_history is the deliberate exception — it is written outside the
// transaction precisely so a run that ends this way still explains itself.

let stack: Stack;

beforeAll(async () => {
  // The 2nd LCA search throws: the first beneficiary is answered, the next is not.
  stack = await startStack({ lcaFailOnSearchCall: 2 });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const rows = async () => (await stack.pool.query("select * from eligibility_results")).rows;

const history = async () =>
  (await stack.pool.query("select * from eligibility_history order by created_at, id")).rows;

describe("a failed batch leaves no result", () => {
  it("writes nothing when an LCA call fails partway through", async () => {
    // CROUS makes the connected adult a beneficiary, AEEH pulls the QF children in —
    // so there is more than one beneficiary and an ordering to break.
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
      residenceInsee: "75113",
    };

    const reason = await stack.enqueueAndWaitFailure(input);
    expect(reason).toContain("LCA");

    // The whole point: not one row, not even for the beneficiary that succeeded.
    expect(await rows()).toHaveLength(0);

    // A send inside the LCA loop would hand out a code for a batch that then rolls back.
    // The accusé de réception is the one mail that stands: it acknowledges the demande and
    // promises no verdict, so a failed batch does not make it wrong.
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
  it("still records the trace, including the LCA failure", async () => {
    const events = await history();
    expect(events.length).toBeGreaterThan(0);

    // The 2nd search throws, so the failure is reported by the catch-all branch.
    const failure = events.find((e) => e.actor === "lca" && e.status === "error");
    expect(failure).toBeDefined();
    expect(failure.error).toContain("502");

    // The calls that DID answer before it are there too — that ordering is the
    // diagnostic value.
    expect(events.some((e) => e.actor === "api_particulier" && e.status === "success")).toBe(true);
    expect(events.some((e) => e.action === "lca.confirm" && e.status === "success")).toBe(true);

    // But nothing claims a result was written, because none was.
    expect(events.some((e) => e.action === "results.persisted")).toBe(false);
  });
});
