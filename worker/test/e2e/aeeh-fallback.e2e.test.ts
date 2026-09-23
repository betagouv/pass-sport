import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { RESOURCE_META } from "../../src/eligibility/client";

// An AEEH child carries no birth COG of their own: the call goes out without a commune and under
// France, which nearly all these children answer to. A 422 is then asked again once, on the
// parent's pays de naissance — only when that pays is not France, since otherwise the second call
// would send exactly what was just refused. validation-error.e2e.test.ts covers a resource with
// no second set of params to fall back on.
//
// The chain for the identity below: qf août, qf septembre (quotient above the threshold, so the
// sweep does not stop), aah, cnous, then one aeeh per child inside the AEEH window. Call 5 is
// the first of those children, and call 6 is his second chance when there is one.

const FIRST_AEEH_CALL = 5;

const AEEH_ACTION = "dss.allocation_enfant_handicape_identite";

const FRANCE = "99100";
const ESPAGNE = "99134";

const inputFor = (sub: string, birthcountry: string) => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry,
    email: "camille.martin@example.test",
    sub,
  },
  isFranceConnected: true,
});

const scenario = (sub: string, birthcountry: string) => {
  let stack: Stack;

  beforeAll(async () => {
    stack = await startStack({ apiRejectOnCall: FIRST_AEEH_CALL });
    await stack.enqueueAndWait(inputFor(sub, birthcountry));
  }, 180_000);

  afterAll(async () => {
    await stack?.close();
  });

  const history = async () =>
    (
      await stack.pool.query(
        "select * from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
        [sub],
      )
    ).rows;

  return {
    aeehEvents: async () => (await history()).filter((e) => e.action === AEEH_ACTION),
    persisted: async () => (await history()).find((e) => e.action === "results.persisted"),
    enfantRows: async () =>
      (
        await stack.pool.query(
          "select * from eligibility_results where allocataire_fc_sub = $1 and source = 'enfant'",
          [sub],
        )
      ).rows,
  };
};

describe("a rejected AEEH child is asked again on the parent's pays de naissance", () => {
  const { aeehEvents, persisted, enfantRows } = scenario("fc-sub-aeeh-fallback", ESPAGNE);

  it("asks twice about that child and once about the others", async () => {
    const events = await aeehEvents();

    // Three children inside the AEEH window, the first of them asked about twice.
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.status)).toEqual([
      "invalid_request",
      "success",
      "success",
      "success",
    ]);
    expect(events.every((e) => e.subject === "enfant")).toBe(true);
  });

  it("sends France first, then the parent's pays, never a commune", async () => {
    const [rejected, retried] = await aeehEvents();

    expect(rejected.body_payload).not.toHaveProperty("code_cog_insee_commune_naissance");
    expect(rejected.body_payload.code_cog_insee_pays_naissance).toBe(FRANCE);

    expect(retried.body_payload).not.toHaveProperty("code_cog_insee_commune_naissance");
    expect(retried.body_payload.code_cog_insee_pays_naissance).toBe(ESPAGNE);
    expect(retried.body_payload.nom_naissance).toBe(rejected.body_payload.nom_naissance);
  });

  it("grants the child the route the rejected call would have cost them", async () => {
    const granted = (await enfantRows()).filter((r) => r.verdict === "eligible_pending");

    expect(granted).toHaveLength(3);
    expect(granted.every((r) => r.situation === "AEEH")).toBe(true);
  });

  // The 422 stays in eligibility_history, but naming it here would say the chain pronounced
  // without that resource — and it did not.
  it("does not name a resource that answered on the second try", async () => {
    const event = await persisted();

    expect(event.response_payload.rejected_resources).toEqual([]);
    expect(event.response_payload.rows).toBe(5);
  });
});

describe("a rejected AEEH child whose parent was born in France is not asked again", () => {
  const { aeehEvents, persisted, enfantRows } = scenario("fc-sub-aeeh-no-fallback", FRANCE);

  it("asks once about each child", async () => {
    const events = await aeehEvents();

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.status)).toEqual(["invalid_request", "success", "success"]);
  });

  it("leaves the rejected child without the AEEH route", async () => {
    const granted = (await enfantRows()).filter((r) => r.verdict === "eligible_pending");

    expect(granted).toHaveLength(2);
  });

  it("names the AEEH call the chain had to pronounce without", async () => {
    const event = await persisted();

    expect(event.response_payload.rejected_resources).toEqual([
      expect.objectContaining({
        resource: RESOURCE_META.aeeh.resource,
        child_index: expect.any(Number),
        reason: "validation",
      }),
    ]);
  });
});
