import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { RESOURCE_META } from "../../src/eligibility/client";

// A 502 carrying the provider's own code 35000 is CNAF/MSA choking on this identity. The provider
// may answer on a later attempt, so while one is left the job fails and retries like on any 5xx
// (atomicity.e2e.test.ts): nothing is pronounced on a partial reading. On the last attempt there is
// nothing left to wait for, and the chain pronounces without it. Only the history tells it apart
// from a platform outage.
//
// The chain for the identity below is: qf août, qf septembre, aah, cnous, then one aeeh per
// child inside the AEEH window. Call 4 is cnous.

let stack: Stack;

const CNOUS_CALL = 4;

const inputFor = (sub: string) => ({
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
});

const rows = async (sub: string) =>
  (
    await stack.pool.query("select * from eligibility_results where allocataire_fc_sub = $1", [
      sub,
    ])
  ).rows;

const history = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
      [sub],
    )
  ).rows;

describe("a provider data error fails the job while a retry is left", () => {
  const sub = "fc-sub-provider-data-error";
  let failureReason: string;

  beforeAll(async () => {
    stack = await startStack({ apiProviderErrorOnCall: CNOUS_CALL });
    failureReason = await stack.enqueueAndWaitFailure(inputFor(sub));
  }, 180_000);

  afterAll(async () => {
    await stack?.close();
  });

  it("fails the job and writes no verdict", async () => {
    expect(failureReason).toContain("API Particulier");
    expect(await rows(sub)).toHaveLength(0);
  });

  it("records it as provider_error", async () => {
    const events = await history(sub);
    const failed = events.filter((e) => e.status === "provider_error");

    expect(failed).toHaveLength(1);
    expect(failed[0].http_status).toBe(502);
    expect(failed[0].action).toContain("etudiant_boursier");
    expect(events.some((e) => e.action === "results.persisted")).toBe(false);
  });

  // Without this the row says a 502 happened and nothing more — no way to tell this apart from a
  // platform outage after the fact, nor to name the provider that dropped it.
  it("keeps the raw API error on that row", async () => {
    const failed = (await history(sub)).find((e) => e.status === "provider_error");

    expect(failed.response_payload.error_code).toBe("35000");
    expect(failed.response_payload.api_error).toMatchObject({
      code: "35000",
      meta: { provider: "CNAF" },
    });
  });
});

describe("a provider data error on the last attempt is pronounced without", () => {
  const sub = "fc-sub-provider-data-error-final";

  beforeAll(async () => {
    stack = await startStack({ apiProviderErrorOnCall: CNOUS_CALL });
    await stack.enqueueAndWait(inputFor(sub));
  }, 180_000);

  afterAll(async () => {
    await stack?.close();
  });

  it("carries on with the children after the silent CROUS", async () => {
    const aeehCalls = (await history(sub)).filter((e) => e.action === RESOURCE_META.aeeh.resource);

    expect(aeehCalls.length).toBeGreaterThan(0);
  });

  it("writes the verdicts, the connected user left without the CROUS route", async () => {
    const written = await rows(sub);
    const self = written.find((r) => r.source === "self");

    expect(self).toMatchObject({ verdict: "not_eligible", is_eligible: false });
    expect(written.some((r) => r.source === "enfant" && r.verdict === "eligible_pending")).toBe(
      true,
    );
  });

  // What the relance reads to know the refusal was pronounced blind.
  it("names the CROUS call the chain had to pronounce without", async () => {
    const persisted = (await history(sub)).find((e) => e.action === "results.persisted");

    expect(persisted.response_payload.rejected_resources).toEqual([
      expect.objectContaining({
        resource: RESOURCE_META.cnous.resource,
        child_index: null,
        reason: "provider_error",
        http_status: 502,
        error_code: "35000",
      }),
    ]);
  });
});
