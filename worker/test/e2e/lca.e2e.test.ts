import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";
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

    const sent = stack.parsedEmails().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].campaign).toBe("pass-sport-code");
    expect(sent[0].templateId).toBe(String(TEMPLATE_IDS.code));
    expect(sent[0].variables["allocataire@example.test"]).toMatchObject({
      code: "24-IIII-IIII",
      prenom: "MANON",
      nom: "DUPOND",
      beneficiaire: "MANON DUPOND",
      salutation: "Bonjour BABETTE DUPOND,",
    });
  });

  it("greets without a dangling comma when the allocataire has no name", async () => {
    const jobId = "lca-nameless-allocataire";
    const before = stack.sentEmails().length;

    await stack.enqueueLcaAndWait(job({ allocataire: {} }), jobId);

    const [sent] = stack.parsedEmails().slice(before);
    expect(sent.variables["allocataire@example.test"].salutation).toBe("Bonjour,");
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
    // LCA holds the beneficiary and served a code, but nothing was mailed. The mail is the
    // same neutral notice a refusal gets, so the verdict is the only place that says so.
    expect(row.verdict).toBe("eligible_confirmed_but_email_not_matching");
    expect(row.email_kind).toBe("not_eligible_hors_fc");
    expect(row.email).toBe("quelquun-dautre@example.test");
    expect(row.email_sent).toBe(true);

    const [sent] = stack.parsedEmails().slice(before);
    expect(sent.campaign).toBe("pass-sport-not-eligible-hors-fc");
    expect(sent.templateId).toBe(String(TEMPLATE_IDS.not_eligible_hors_fc));
    expect(sent.recipients).toEqual(["quelquun-dautre@example.test"]);
    // Nothing about the beneficiary reaches an address nobody verified.
    expect(sent.variables).toEqual({});

    const [body] = stack.sentEmails().slice(before);
    expect(body).not.toContain("24-IIII-IIII");
    expect(body).not.toContain("MANON");
    expect(body).not.toContain("DUPOND");
    // The address LCA holds is only ever compared against, never written to.
    expect(body).not.toContain("allocataire@example.test");
  });

  it("mails the same thing whether LCA holds the beneficiary or not", async () => {
    const contactEmail = "tiers@example.test";
    const before = stack.sentEmails().length;

    // Same typed address, so the two bodies are comparable byte for byte.
    await stack.enqueueLcaAndWait(job({ contactEmail }), "lca-oracle-confirmed");
    await stack.enqueueLcaAndWait(
      job({ contactEmail, lcaStatus: "not_found", passSportCode: null, email: null }),
      "lca-oracle-not-found",
    );

    const [withheld, refused] = stack.sentEmails().slice(before);
    // Whoever filled the form chose that address: two distinguishable mails would tell them
    // whether the person they named is a beneficiary.
    expect(withheld).toBe(refused);
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
    expect(row.email_kind).toBe("not_eligible_hors_fc");
    expect(row.email).toBe("allocataire@example.test");
    expect(row.email_sent).toBe(true);

    const sent = stack.parsedEmails().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0].campaign).toBe("pass-sport-not-eligible-hors-fc");
    expect(sent[0].templateId).toBe(String(TEMPLATE_IDS.not_eligible_hors_fc));
    expect(sent[0].variables).toEqual({});
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
