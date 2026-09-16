import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// A 422 is API Particulier rejecting the params we sent — deterministic, so retrying the job
// four times over a day changes nothing. The chain therefore carries on and every candidate is
// still pronounced upon, where a 502 (see atomicity.e2e.test.ts) fails the job and writes nothing.
//
// The chain for the identity below is: qf août, qf septembre, aah, cnous, then one aeeh per
// child inside the AEEH window. Call 4 is cnous, which is the self candidate's only remaining
// route once aah answers est_beneficiaire:false.

let stack: Stack;

const CNOUS_CALL = 4;

const sub = "fc-sub-validation-error";

const input = {
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15", // age 22 at 2026-12-31 -> inside the AAH and CROUS windows
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
    sub,
  },
  isFranceConnected: true,
};

beforeAll(async () => {
  stack = await startStack({ apiRejectOnCall: CNOUS_CALL });
  await stack.enqueueAndWait(input);
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const rows = async () =>
  (
    await stack.pool.query(
      "select * from eligibility_results where allocataire_fc_sub = $1 order by source, (enfant_identite->>'given_name')",
      [sub],
    )
  ).rows;

const history = async () =>
  (
    await stack.pool.query(
      "select * from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
      [sub],
    )
  ).rows;

describe("a rejected call does not break the chain", () => {
  it("still pronounces on every beneficiary", async () => {
    const results = await rows();

    // The four children the QF answer names, plus the connected adult.
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.verdict !== null)).toBe(true);
  });

  it("refuses the candidate whose only route was rejected", async () => {
    const self = (await rows()).find((r) => r.source === "self");

    // AAH answered no and CROUS never answered at all: nothing opened, so the refusal stands.
    expect(self.verdict).toBe("not_eligible");
    expect(self.is_eligible).toBe(false);
  });

  it("keeps the calls made after the rejected one", async () => {
    const children = (await rows()).filter((r) => r.source === "enfant");
    const granted = children.filter((r) => r.verdict === "eligible_pending");

    // The three inside the AEEH window; the fourth is 21 ans, so no call was ever made for them.
    expect(granted).toHaveLength(3);
    expect(granted.every((r) => r.situation === "AEEH")).toBe(true);
  });

  it("records the rejection as its own status, not as an error", async () => {
    const events = await history();
    const rejected = events.filter((e) => e.status === "invalid_request");

    expect(rejected).toHaveLength(1);
    expect(rejected[0].http_status).toBe(422);
    expect(rejected[0].action).toContain("etudiant_boursier");
    expect(events.some((e) => e.status === "error")).toBe(false);
  });

  // Without this the row says a 422 happened and nothing more, which is not enough to tell which
  // param the API refused without going back to the logs.
  it("keeps the raw API error on that row", async () => {
    const rejected = (await history()).find((e) => e.status === "invalid_request");

    expect(rejected.response_payload.error_code).toBe("40001");
    expect(rejected.response_payload.api_error).toMatchObject({ code: "40001" });
  });

  it("names the rejected resource on the row that persisted the verdicts", async () => {
    const persisted = (await history()).find((e) => e.action === "results.persisted");

    expect(persisted.response_payload.rows).toBe(5);
    expect(persisted.response_payload.rejected_resources).toHaveLength(1);
    expect(persisted.response_payload.rejected_resources[0]).toMatchObject({
      reason: "validation",
      http_status: 422,
      error_code: "40001",
    });
    expect(persisted.response_payload.rejected_resources[0].resource).toContain(
      "etudiant_boursier",
    );
  });
});
