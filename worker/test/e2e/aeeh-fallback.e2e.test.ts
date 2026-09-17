import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// An AEEH child carries no birth COG of their own: the call goes out under the parent's commune
// and pays de naissance. That pair is a plausible cause of a 422, so a rejected child is asked
// again on the pays alone before the chain gives up on them — where validation-error.e2e.test.ts
// covers a resource with no second set of params to fall back on.
//
// The chain for the identity below: qf août, qf septembre (quotient above the threshold, so the
// sweep does not stop), aah, cnous, then one aeeh per child inside the AEEH window. Call 5 is
// the first of those children, and call 6 is his second chance.

let stack: Stack;

const FIRST_AEEH_CALL = 5;

const sub = "fc-sub-aeeh-fallback";

const AEEH_ACTION = "dss.allocation_enfant_handicape_identite";

const input = {
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
    sub,
  },
  isFranceConnected: true,
};

beforeAll(async () => {
  stack = await startStack({ apiRejectOnCall: FIRST_AEEH_CALL });
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

const aeehEvents = async () => (await history()).filter((e) => e.action === AEEH_ACTION);

describe("a rejected AEEH child is asked again on the pays de naissance alone", () => {
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

  it("drops the commune de naissance and keeps the pays on the second call", async () => {
    const [rejected, retried] = await aeehEvents();

    expect(rejected.body_payload.code_cog_insee_commune_naissance).toBe("75056");
    expect(rejected.body_payload.code_cog_insee_pays_naissance).toBe("99100");

    expect(retried.body_payload).not.toHaveProperty("code_cog_insee_commune_naissance");
    expect(retried.body_payload.code_cog_insee_pays_naissance).toBe("99100");
    expect(retried.body_payload.nom_naissance).toBe(rejected.body_payload.nom_naissance);
  });

  it("grants the child the route the rejected call would have cost them", async () => {
    const children = (await rows()).filter((r) => r.source === "enfant");
    const granted = children.filter((r) => r.verdict === "eligible_pending");

    expect(granted).toHaveLength(3);
    expect(granted.every((r) => r.situation === "AEEH")).toBe(true);
  });

  // The 422 stays in eligibility_history, but naming it here would say the chain pronounced
  // without that resource — and it did not.
  it("does not name a resource that answered on the second try", async () => {
    const persisted = (await history()).find((e) => e.action === "results.persisted");

    expect(persisted.response_payload.rejected_resources).toEqual([]);
    expect(persisted.response_payload.rows).toBe(5);
  });
});
