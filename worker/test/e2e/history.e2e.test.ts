import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import type { Allowance } from "../../src/eligibility/types";

// eligibility_history is the trace of HOW an outcome was reached: one row per external
// call, written outside the PHASE 2 transaction so it survives a job that dies partway.
//
// Unlike eligibility_results, the payload here is stored RAW — pass Sport code and
// matricule included — and rows are never purged. That is a deliberate decision, so it is
// asserted, not guarded against; see the "keeps the raw payload" case below. The lone
// exception is pdf_base_64, dropped for weight.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const historyFor = async (sub: string) =>
  (
    await stack.pool.query(
      "select * from eligibility_history where allocataire_fc_sub = $1 order by created_at, id",
      [sub],
    )
  ).rows;

// CROUS only: one API Particulier call, one beneficiary, one LCA search + confirm.
// The shortest job that still exercises every actor.
const selfCrous = (sub: string) => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15", // age 22 at 2026-12-31 -> CROUS eligible
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
    sub,
  },
  aides: ["CROUS"] as Allowance[],
  isFranceConnected: true,
  residenceInsee: "75113",
});

describe("eligibility_history", () => {
  it("records every actor's action in order", async () => {
    const sub = "fc-sub-history-nominal";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);

    expect(rows.map((r) => [r.actor, r.action, r.status])).toEqual([
      ["api_particulier", "cnous.etudiant_boursier_identite", "success"],
      ["lca", "lca.search", "success"],
      ["lca", "lca.confirm", "success"],
      ["worker", "results.persisted", "success"],
      ["worker", "email.digest", "success"],
    ]);

    // The durable correlation key. job_id is written too, but BullMQ deletes the job,
    // so the sub is the only one that still resolves later.
    expect(rows.every((r) => r.allocataire_fc_sub === sub)).toBe(true);
    expect(rows.every((r) => r.job_id !== null)).toBe(true);
    expect(rows.every((r) => r.attempt === 0)).toBe(true);

    // The LCA calls name their beneficiary; the job-level worker events do not.
    const lca = rows.filter((r) => r.actor === "lca");
    expect(lca.every((r) => r.subject === "self")).toBe(true);
    expect(rows.find((r) => r.action === "results.persisted")?.subject).toBeNull();

    // Timings are recorded for the calls that go out, not for the bookkeeping events.
    expect(
      rows
        .filter((r) => r.actor !== "worker")
        .every((r) => typeof r.duration_ms === "number" && r.duration_ms >= 0),
    ).toBe(true);

    // Same rule for the status: every call that reached an answer records the one it got,
    // successes included. It stayed null on the LCA rows until the client carried it out.
    expect(lca.map((r) => r.http_status)).toEqual([200, 200]);
  });

  it("keeps the raw payload, pass Sport code and matricule included", async () => {
    const sub = "fc-sub-history-raw";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);
    const confirm = rows.find((r) => r.action === "lca.confirm");

    // Deliberate, not a leak: eligibility_results still never sees these (see
    // pipeline.e2e.test.ts "never stores the pass Sport code"), and the retention purge
    // is what bounds them here. Without this assertion the next reader of schema.ts
    // "fixes" a bug that is not one.
    expect(confirm?.payload?.item?.id_psp).toBe("PSP-CODE-123");
    expect(confirm?.payload?.item?.allocataire?.matricule).toBe("SECRET-MATRICULE");

    // Same for the search: the matricule LCA returns is kept as answered.
    const search = rows.find((r) => r.action === "lca.search");
    expect(search?.payload?.result_count).toBe(1);
    expect(search?.payload?.results?.[0]?.matricule).toBe("SECRET-MATRICULE");

    // And the digest, codes and names and all.
    const email = rows.find((r) => r.action === "email.digest");
    expect(email?.payload?.entries?.[0]?.code).toBe("PSP-CODE-123");
  });

  it("drops pdf_base_64, the one field not worth its weight", async () => {
    const sub = "fc-sub-history-nopdf";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);
    const confirm = rows.find((r) => r.action === "lca.confirm");

    // The fake LCA client DOES return one, so this is a real drop, not an empty check.
    expect(confirm?.payload?.item?.id_psp).toBe("PSP-CODE-123");
    expect(confirm?.payload?.item?.pdf_base_64).toBeUndefined();

    // Column-layout independent, like the eligibility_results guard: the attestation
    // appears nowhere in the whole table.
    const blobs = await stack.pool.query(
      "select row_to_json(t)::text as blob from eligibility_history t",
    );
    expect(blobs.rows.some((b) => b.blob.includes("FAKE-ATTESTATION"))).toBe(false);
  });
});
