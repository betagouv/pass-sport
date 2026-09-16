import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// A 502 carrying the provider's own code 35000 is CNAF/MSA choking on this one identity, not the
// platform being down — the same distinction qf-batch makes. Deterministic, so the four job
// attempts spread over a day would hear it four times. The chain therefore carries on, exactly
// like the 422 of validation-error.e2e.test.ts, where a 502 without that code (atomicity.e2e.test.ts)
// still fails the job and writes nothing.
//
// The chain for the identity below is: qf août, qf septembre, aah, cnous, then one aeeh per
// child inside the AEEH window. Call 4 is cnous, the self candidate's only remaining route once
// aah answers est_beneficiaire:false.

let stack: Stack;

const CNOUS_CALL = 4;

const sub = "fc-sub-provider-data-error";

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
  stack = await startStack({ apiProviderErrorOnCall: CNOUS_CALL });
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

describe("a provider data error does not break the chain", () => {
  it("still pronounces on every beneficiary", async () => {
    const results = await rows();

    // The four children the QF answer names, plus the connected adult.
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.verdict !== null)).toBe(true);
  });

  it("refuses the candidate whose only route went unanswered", async () => {
    const self = (await rows()).find((r) => r.source === "self");

    expect(self.verdict).toBe("not_eligible");
    expect(self.is_eligible).toBe(false);
  });

  it("keeps the calls made after the failed one", async () => {
    const children = (await rows()).filter((r) => r.source === "enfant");
    const granted = children.filter((r) => r.verdict === "eligible_pending");

    // The three inside the AEEH window; the fourth is 21 ans, so no call was ever made for them.
    expect(granted).toHaveLength(3);
    expect(granted.every((r) => r.situation === "AEEH")).toBe(true);
  });

  it("records it as provider_error, not as an error that would have failed the job", async () => {
    const events = await history();
    const failed = events.filter((e) => e.status === "provider_error");

    expect(failed).toHaveLength(1);
    expect(failed[0].http_status).toBe(502);
    expect(failed[0].action).toContain("etudiant_boursier");
    expect(events.some((e) => e.status === "error")).toBe(false);
  });

  // Without this the row says a 502 happened and nothing more — no way to tell this apart from a
  // platform outage after the fact, nor to name the provider that dropped it.
  it("keeps the raw API error on that row", async () => {
    const failed = (await history()).find((e) => e.status === "provider_error");

    expect(failed.response_payload.error_code).toBe("35000");
    expect(failed.response_payload.api_error).toMatchObject({
      code: "35000",
      meta: { provider: "CNAF" },
    });
  });

  it("names the unanswered resource on the row that persisted the verdicts", async () => {
    const persisted = (await history()).find((e) => e.action === "results.persisted");

    expect(persisted.response_payload.rows).toBe(5);
    expect(persisted.response_payload.rejected_resources).toHaveLength(1);
    expect(persisted.response_payload.rejected_resources[0]).toMatchObject({
      reason: "provider_error",
      http_status: 502,
      error_code: "35000",
    });
    expect(persisted.response_payload.rejected_resources[0].resource).toContain(
      "etudiant_boursier",
    );
  });
});
