import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// eligibility_history is the trace of HOW an outcome was reached: one row per external
// call, written outside the PHASE 2 transaction so it survives a job that dies partway.
//
// Unlike eligibility_results, the payloads here are stored RAW — the identité pivot the
// endpoint was called with included — and rows are never purged. That is a deliberate
// decision, so it is asserted, not guarded against; see the "keeps the raw payload" case
// below.
//
// Two columns, two directions: body_payload is what went out on the wire, response_payload
// is what came back.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
  stack.setQfChildless(true);
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

// Paired with setQfChildless in beforeAll: no enfant means no per-child AEEH, which keeps
// the expected action list short enough to read while still exercising both actors.
const selfCrous = (sub: string) => ({
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

describe("eligibility_history", () => {
  it("records every actor's action in order", async () => {
    const sub = "fc-sub-history-nominal";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);

    // No LCA event and no outcome mail: this path calls nothing but API Particulier, and
    // the accusé de réception is its only envelope.
    expect(rows.map((r) => [r.actor, r.action, r.status])).toEqual([
      // First, and before any external call: the accusé de réception is what the usager
      // gets while the chain below runs.
      ["worker", "email.acknowledgment", "success"],
      // The quotient sweep: août then septembre, neither under the threshold.
      ["api_particulier", "dss.quotient_familial_identite", "success"],
      ["api_particulier", "dss.quotient_familial_identite", "success"],
      ["api_particulier", "dss.allocation_adulte_handicape_identite", "success"],
      ["api_particulier", "cnous.etudiant_boursier_identite", "success"],
      ["worker", "results.persisted", "success"],
    ]);

    // The durable correlation key. job_id is written too, but BullMQ deletes the job,
    // so the sub is the only one that still resolves later.
    expect(rows.every((r) => r.allocataire_fc_sub === sub)).toBe(true);
    expect(rows.every((r) => r.job_id !== null)).toBe(true);
    expect(rows.every((r) => r.attempt === 0)).toBe(true);

    // The API Particulier calls name their beneficiary; the job-level worker events do not.
    const api = rows.filter((r) => r.actor === "api_particulier");
    expect(api.every((r) => r.subject === "self")).toBe(true);
    expect(rows.find((r) => r.action === "results.persisted")?.subject).toBeNull();

    // Timings are recorded for the calls that go out, not for the bookkeeping events.
    expect(
      rows
        .filter((r) => r.actor !== "worker")
        .every((r) => typeof r.duration_ms === "number" && r.duration_ms >= 0),
    ).toBe(true);

    // Same rule for the status: every call that reached an answer records the one it got,
    // successes included.
    expect(api.map((r) => r.http_status)).toEqual([200, 200, 200, 200]);
  });

  it("keeps the raw answer, exactly as the endpoint gave it", async () => {
    const sub = "fc-sub-history-raw";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);
    const cnous = rows.find((r) => r.action === "cnous.etudiant_boursier_identite");

    // Deliberate, not a leak: eligibility_results keeps only the verdict, and this table is
    // what lets a case be replayed exactly as it happened. Without this assertion the next
    // reader of schema.ts "fixes" a bug that is not one.
    expect(cnous?.response_payload?.data?.statut_boursier?.est_boursier).toBe(true);
    // Rate-limit state is carried on every answer, success included — it is what the
    // proactive pause reads back.
    expect(cnous?.response_payload).toHaveProperty("rate_limit_remaining");
  });

  it("records what each endpoint was called with, not only what it answered", async () => {
    const sub = "fc-sub-history-body";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);

    // The identité pivot as it went on the wire — the CNOUS resource uses its own
    // camelCase params (eligibility/client.ts toCnousParams).
    const cnous = rows.find((r) => r.action === "cnous.etudiant_boursier_identite");
    expect(cnous?.body_payload).toBeTruthy();
    expect(JSON.stringify(cnous?.body_payload)).toContain("Martin");

    // The bookkeeping events call nothing, so they have no request side.
    expect(rows.find((r) => r.action === "results.persisted")?.body_payload).toBeNull();
  });

  it("ne journalise aucun appel LCA sur le parcours FranceConnect", async () => {
    const sub = "fc-sub-history-no-lca";
    await stack.enqueueAndWait(selfCrous(sub));

    const rows = await historyFor(sub);
    expect(rows.some((r) => r.actor === "lca")).toBe(false);
    expect(rows.some((r) => r.action.startsWith("email.") && r.action !== "email.acknowledgment")).toBe(
      false,
    );
  });
});
