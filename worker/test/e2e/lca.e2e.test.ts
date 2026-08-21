import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { CAISSE, SITUATION, type LcaJobData } from "../../src/eligibility/types";

// The two-step form answers inside the usager's request: LCA is called by the site, which
// already showed the code on screen. What lands on this queue is the aftermath — the trace,
// the row, and the outcome email to the address collected at step two.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const job = (overrides: Partial<LcaJobData> = {}): LcaJobData => ({
  aide: SITUATION.QF,
  caisse: CAISSE.CAF,
  beneficiary: { lastname: "DUPOND", firstname: "MANON", birthdate: "2011-01-01" },
  allocataire: { family_name: "DUPOND", given_name: "BABETTE" },
  residenceInsee: "05024",
  lcaStatus: "confirmed",
  passSportCode: "24-IIII-IIII",
  contactEmail: "allocataire@example.test",
  email: "allocataire@example.test",
  history: [
    {
      action: "lca.search",
      status: "success",
      durationMs: 42,
      bodyPayload: { beneficiaryLastname: "DUPOND" },
      responsePayload: { result_count: 1 },
    },
    {
      action: "lca.confirm",
      status: "success",
      durationMs: 51,
      bodyPayload: { id: "1234" },
      responsePayload: { item: { id_psp: "24-IIII-IIII" } },
    },
  ],
  ...overrides,
});

const resultsFor = async (jobId: string) =>
  (await stack.pool.query("select * from eligibility_results where job_id = $1", [jobId])).rows;

const historyFor = async (jobId: string) =>
  (
    await stack.pool.query(
      "select actor, action, status from eligibility_history where job_id = $1 order by created_at, id",
      [jobId],
    )
  ).rows;

describe("lca job", () => {
  it("records the verdict and mails the code when the address matches the one LCA holds", async () => {
    const jobId = "lca-confirmed";
    const before = stack.sentEmails().length;

    await stack.enqueueLcaAndWait(job(), jobId);

    const [row] = await resultsFor(jobId);
    expect(row.verdict).toBe("eligible_confirmed");
    expect(row.pass_sport_code).toBe("24-IIII-IIII");
    expect(row.is_eligible).toBe(true);
    expect(row.is_france_connected).toBe(false);
    expect(row.source).toBe("enfant");
    expect(row.email).toBe("allocataire@example.test");
    expect(row.email_kind).toBe("code");
    expect(row.email_sent).toBe(true);

    const sent = stack.sentEmails().slice(before);
    expect(sent).toHaveLength(1);
    expect(decodeURIComponent(sent[0])).toContain("24-IIII-IIII");
    expect(decodeURIComponent(sent[0])).toContain("pass-sport-lca-succes");
  });

  it("still writes the answer of a job enqueued before the payload split", async () => {
    const jobId = "lca-legacy-payload";

    await stack.enqueueLcaAndWait(
      job({
        history: [
          {
            action: "lca.confirm",
            status: "success",
            durationMs: 51,
            payload: { item: { id_psp: "24-IIII-IIII" } },
          },
        ],
      }),
      jobId,
    );

    const [replayed] = (
      await stack.pool.query(
        "select body_payload, response_payload from eligibility_history where job_id = $1 and action = 'lca.confirm'",
        [jobId],
      )
    ).rows;

    expect(replayed.response_payload.item.id_psp).toBe("24-IIII-IIII");
    expect(replayed.body_payload).toBeNull();
  });

  it("withholds the code when the collected address is not the one LCA holds", async () => {
    const jobId = "lca-email-mismatch";
    const before = stack.sentEmails().length;

    await stack.enqueueLcaAndWait(job({ contactEmail: "quelquun-dautre@example.test" }), jobId);

    const [row] = await resultsFor(jobId);
    // LCA holds the beneficiary and served a code, but nothing was mailed: the verdict says so
    // rather than claim a delivered code.
    expect(row.verdict).toBe("eligible_confirmed_but_email_not_matching");
    expect(row.email_kind).toBe("code_withheld");
    expect(row.email).toBe("quelquun-dautre@example.test");
    expect(row.email_sent).toBe(true);

    const sent = stack.sentEmails().slice(before);
    expect(sent).toHaveLength(1);
    const body = decodeURIComponent(sent[0]);
    expect(body).toContain("pass-sport-lca-echec");
    expect(body).toContain("quelquun-dautre@example.test");
    expect(body).not.toContain("24-IIII-IIII");
    // The address LCA holds is only ever compared against, never written to.
    expect(body).not.toContain("allocataire@example.test");
  });

  it("replays the LCA calls the site made into eligibility_history", async () => {
    const jobId = "lca-history";

    await stack.enqueueLcaAndWait(job(), jobId);

    const events = await historyFor(jobId);
    expect(events.filter((e) => e.actor === "lca").map((e) => e.action)).toEqual([
      "lca.search",
      "lca.confirm",
    ]);
    expect(events.some((e) => e.action === "results.persisted")).toBe(true);
  });

  it("records a refusal and still tells the usager", async () => {
    const jobId = "lca-not-found";
    const before = stack.sentEmails().length;

    await stack.enqueueLcaAndWait(
      job({ lcaStatus: "not_found", passSportCode: null, email: null }),
      jobId,
    );

    const [row] = await resultsFor(jobId);
    expect(row.verdict).toBe("not_eligible");
    expect(row.pass_sport_code).toBeNull();
    expect(row.email_kind).toBe("not_eligible");
    expect(row.email).toBe("allocataire@example.test");
    expect(row.email_sent).toBe(true);

    const sent = stack.sentEmails().slice(before);
    expect(sent).toHaveLength(1);
    expect(decodeURIComponent(sent[0])).toContain("pass-sport-lca-echec");
  });

  it("claims nothing, and mails nothing, when LCA was unreachable", async () => {
    const jobId = "lca-error";
    const before = stack.sentEmails().length;

    await stack.enqueueLcaAndWait(
      job({ lcaStatus: "error", passSportCode: null, email: null }),
      jobId,
    );

    expect(stack.sentEmails()).toHaveLength(before);

    // No verdict was reached, so no row: applications_by_job_id stays empty too and the
    // usager can come back once the gateway is up.
    expect(await resultsFor(jobId)).toHaveLength(0);

    // The trace still lands — the LCA calls the site made, then the explicit skip.
    const actions = (await historyFor(jobId)).map((e) => [e.action, e.status]);
    expect(actions).toContainEqual(["results.skipped", "skipped"]);
    expect(actions).toContainEqual(["lca.search", "success"]);
  });

  it("does not write a second row nor a second email when the usager resubmits", async () => {
    const jobId = "lca-resubmit";

    await stack.enqueueLcaAndWait(job(), jobId);
    const before = stack.sentEmails().length;

    // The producer runs with removeOnComplete, which the harness does not set: drop the
    // finished job by hand so the resubmission is not silently collapsed onto it by BullMQ.
    await (await stack.lcaQueue.getJob(jobId))?.remove();

    const result = (await stack.enqueueLcaAndWait(job(), jobId)) as { skipped: boolean };

    expect(result.skipped).toBe(true);
    expect(await resultsFor(jobId)).toHaveLength(1);
    expect(stack.sentEmails()).toHaveLength(before);
  });
});
