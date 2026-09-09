import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { PENDING_CHECK_INSEE_CODE } from "../../src/lca/insee";

// The pass that closes the loop opened by data/2026/partners/franceconnect: a /confirm answering
// the code we hold is the proof that the minted code landed in the LCA base.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
  // Defeat the cooldown: these tests run several passes back to back, and a row settled one
  // millisecond ago must still be re-selectable.
  process.env.LCA_CHECKS_COOLDOWN_MIN = "0";
}, 180_000);

afterAll(async () => {
  delete process.env.LCA_CHECKS_COOLDOWN_MIN;
  await stack?.close();
});

afterEach(async () => {
  // The selection is global, so a leftover row would be picked up by the next pass.
  await stack.pool.query("delete from eligibility_results");
  await stack.pool.query("delete from eligibility_history");
  stack.setLcaConfirmCode(null);
  stack.setLcaSearchHttpStatus(null);
  stack.setLcaConfirmHttpStatus(null);
  stack.setLcaSearchResultCount(1);
  stack.lcaSearchPayloads().length = 0;
  stack.lcaConfirmPayloads().length = 0;
});

type ResultRow = { verdict: string; lca_status: string; pass_sport_code: string; attempts: number };

const readRow = async (id: string): Promise<ResultRow> => {
  const { rows } = await stack.pool.query<ResultRow>(
    `select verdict, lca_status, pass_sport_code, lca_check_attempts as attempts
       from eligibility_results where id = $1`,
    [id],
  );
  return rows[0];
};

const historyActions = async (): Promise<{ action: string; status: string }[]> => {
  const { rows } = await stack.pool.query<{ action: string; status: string }>(
    "select action, status from eligibility_history order by created_at, action",
  );
  return rows;
};

const historyPayload = async (action: string): Promise<Record<string, unknown>> => {
  const { rows } = await stack.pool.query<{ response_payload: Record<string, unknown> }>(
    "select response_payload from eligibility_history where action = $1 order by created_at desc limit 1",
    [action],
  );
  return rows[0]?.response_payload;
};

describe("eligible_pending_lca_checks", () => {
  it("flips a self and an enfant row once LCA serves their codes", async () => {
    const selfId = await stack.seedPendingLcaRow({ sub: "sub-self", code: "PSP-SELF" });
    const enfantId = await stack.seedPendingLcaRow({
      sub: "sub-enfant",
      code: "PSP-ENFANT",
      source: "enfant",
      lastname: "ZALQUIN",
      firstname: "Fenrys",
      birthdate: "2015-06-02",
    });

    stack.setLcaConfirmCode((payload) =>
      payload.recipientLastname === "ZALQUIN" ? "PSP-ENFANT" : "PSP-SELF",
    );

    await stack.enqueueLcaChecksAndWait();

    expect(await readRow(selfId)).toMatchObject({
      verdict: "eligible_confirmed",
      lca_status: "confirmed",
      pass_sport_code: "PSP-SELF",
    });
    expect(await readRow(enfantId)).toMatchObject({
      verdict: "eligible_confirmed",
      lca_status: "confirmed",
      pass_sport_code: "PSP-ENFANT",
    });

    // What actually proves the user-visible goal: the view the site reads now carries the code.
    const { rows } = await stack.pool.query<{ sub: string; pass_sport_code: string }>(
      "select sub, pass_sport_code from application_results_by_sub where verdict = 'eligible_confirmed' order by sub",
    );
    expect(rows.map((r) => r.pass_sport_code)).toEqual(["PSP-ENFANT", "PSP-SELF"]);
  });

  it("searches on the fictional commune, no row carrying one", async () => {
    await stack.seedPendingLcaRow({ sub: "sub-insee", code: "PSP-INSEE" });

    await stack.enqueueLcaChecksAndWait();

    expect(stack.lcaSearchPayloads()).toHaveLength(1);
    expect(stack.lcaSearchPayloads()[0].recipientResidencePlace).toBe(PENDING_CHECK_INSEE_CODE);
  });

  it("leaves a row pending and counts the attempt when LCA has no record yet", async () => {
    const id = await stack.seedPendingLcaRow({
      sub: "sub-absent",
      code: "PSP-ABSENT",
      lastname: "NOMATCHOVIA",
    });

    await stack.enqueueLcaChecksAndWait();

    expect(await readRow(id)).toMatchObject({
      verdict: "eligible_pending_lca",
      lca_status: "not_found",
      attempts: 1,
    });
    expect(await historyPayload("lca_checks.still_pending")).toMatchObject({ stage: "search" });

    // The next pass takes the same row again — the cooldown is what paces this in production.
    await stack.enqueueLcaChecksAndWait();

    expect((await readRow(id)).attempts).toBe(2);
  });

  it("holds a row back and does not overwrite the code when LCA answers another one", async () => {
    const id = await stack.seedPendingLcaRow({ sub: "sub-mismatch", code: "PSP-MINE" });

    stack.setLcaConfirmCode("PSP-SOMEONE-ELSE");

    await stack.enqueueLcaChecksAndWait();

    expect(await readRow(id)).toMatchObject({
      verdict: "eligible_pending_lca",
      lca_status: "error",
      pass_sport_code: "PSP-MINE",
      attempts: 1,
    });
    expect(await historyPayload("lca_checks.code_mismatch")).toMatchObject({
      stored_code: "PSP-MINE",
      lca_codes: ["PSP-SOMEONE-ELSE"],
    });
  });

  it("keeps going when the gateway fails on one row out of three", async () => {
    const ids = await Promise.all([
      stack.seedPendingLcaRow({ sub: "sub-a", code: "PSP-SHARED", firstname: "Aldreth" }),
      stack.seedPendingLcaRow({ sub: "sub-b", code: "PSP-SHARED", firstname: "Brenwyl" }),
      stack.seedPendingLcaRow({ sub: "sub-c", code: "PSP-SHARED", firstname: "Corvath" }),
    ]);

    stack.setLcaConfirmCode("PSP-SHARED");
    stack.setLcaConfirmHttpStatus((payload) =>
      payload.recipientFirstname === "Brenwyl" ? 502 : null,
    );

    await stack.enqueueLcaChecksAndWait();

    expect(await historyPayload("lca_checks.run_finished")).toMatchObject({
      selected: 3,
      processed: 3,
      confirmed: 2,
      errors: 1,
    });

    const verdicts = await Promise.all(ids.map(async (id) => (await readRow(id)).verdict));
    expect(verdicts.filter((v) => v === "eligible_confirmed")).toHaveLength(2);
    expect(verdicts.filter((v) => v === "eligible_pending_lca")).toHaveLength(1);
    expect(await readRow(ids[1])).toMatchObject({
      verdict: "eligible_pending_lca",
      lca_status: "error",
      attempts: 1,
    });
  });

  // Pins the "no batching" decision: this would fail on any LIMIT or paging reintroduced into the
  // selection.
  it("confirms every eligible row, not a subset", async () => {
    const seeds = Array.from({ length: 120 }, (_, i) => ({
      sub: `sub-bulk-${i}`,
      code: "PSP-BULK",
    }));
    for (const seed of seeds) await stack.seedPendingLcaRow(seed);

    stack.setLcaConfirmCode("PSP-BULK");

    await stack.enqueueLcaChecksAndWait();

    expect(await historyPayload("lca_checks.run_finished")).toMatchObject({
      selected: 120,
      processed: 120,
      confirmed: 120,
      stopped_early: false,
    });

    const { rows } = await stack.pool.query<{ count: string }>(
      "select count(*) from eligibility_results where verdict = 'eligible_pending_lca'",
    );
    expect(rows[0].count).toBe("0");
  });

  it("selects nothing and calls nothing on a second pass", async () => {
    await stack.seedPendingLcaRow({ sub: "sub-idem", code: "PSP-IDEM" });
    stack.setLcaConfirmCode("PSP-IDEM");

    await stack.enqueueLcaChecksAndWait();
    expect(stack.lcaConfirmPayloads()).toHaveLength(1);

    await stack.enqueueLcaChecksAndWait();

    expect(stack.lcaConfirmPayloads()).toHaveLength(1);
    expect(await historyPayload("lca_checks.run_finished")).toMatchObject({
      selected: 0,
      processed: 0,
    });
  });

  it("tries the next candidate when a search answers several records", async () => {
    const id = await stack.seedPendingLcaRow({ sub: "sub-multi", code: "PSP-SECOND" });

    stack.setLcaSearchResultCount(3);
    // Only the second record carries our code — the first is a homonym.
    stack.setLcaConfirmCode((payload) => (payload.id === "2" ? "PSP-SECOND" : "PSP-OTHER"));

    await stack.enqueueLcaChecksAndWait();

    expect(await readRow(id)).toMatchObject({ verdict: "eligible_confirmed" });
    expect(stack.lcaConfirmPayloads().map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("skips a row whose identity is incomplete without calling LCA", async () => {
    const id = await stack.seedPendingLcaRow({ sub: "sub-partial", code: "PSP-PARTIAL" });
    await stack.pool.query(
      `update eligibility_results
          set allocataire_identite = allocataire_identite - 'birthdate'
        where id = $1`,
      [id],
    );

    await stack.enqueueLcaChecksAndWait();

    expect(stack.lcaSearchPayloads()).toHaveLength(0);
    expect(await readRow(id)).toMatchObject({ verdict: "eligible_pending_lca", attempts: 1 });
    expect(await historyPayload("lca_checks.unprocessable")).toMatchObject({
      reason: "missing_identity",
    });
  });

  it("journals a dry run without moving a single verdict", async () => {
    const id = await stack.seedPendingLcaRow({ sub: "sub-dry", code: "PSP-DRY" });
    stack.setLcaConfirmCode("PSP-DRY");

    await stack.enqueueLcaChecksAndWait({ dryRun: true });

    expect(await readRow(id)).toMatchObject({
      verdict: "eligible_pending_lca",
      // Untouched too: a dry run does not spend an attempt.
      lca_status: "not_applicable",
      attempts: 0,
    });

    const actions = (await historyActions()).map((r) => r.action);
    expect(actions).toContain("lca.pending_check.search");
    expect(actions).toContain("lca.pending_check.confirm");
    expect(actions).toContain("lca_checks.confirmed");
  });

  it("drops LCA's attestation from the trace but keeps the rest", async () => {
    await stack.seedPendingLcaRow({ sub: "sub-trace", code: "PSP-TRACE" });
    stack.setLcaConfirmCode("PSP-TRACE");

    await stack.enqueueLcaChecksAndWait();

    const confirm = (await historyPayload("lca.pending_check.confirm")) as {
      item: Record<string, unknown>;
      stored_code: string;
    };
    expect(confirm.item).not.toHaveProperty("pdf_base_64");
    expect(confirm.item.id_psp).toBe("PSP-TRACE");
    expect(confirm.stored_code).toBe("PSP-TRACE");
  });

  it("stops honouring the attempt ceiling", async () => {
    const id = await stack.seedPendingLcaRow({
      sub: "sub-exhausted",
      code: "PSP-EXHAUSTED",
      attempts: 5,
    });

    process.env.LCA_CHECKS_MAX_ATTEMPTS = "5";
    try {
      await stack.enqueueLcaChecksAndWait();
    } finally {
      delete process.env.LCA_CHECKS_MAX_ATTEMPTS;
    }

    expect(stack.lcaSearchPayloads()).toHaveLength(0);
    expect((await readRow(id)).attempts).toBe(5);
  });

  it("collapses two ticks into one pass while the first is still queued", async () => {
    await stack.seedPendingLcaRow({ sub: "sub-collapse", code: "PSP-COLLAPSE" });
    stack.setLcaConfirmCode("PSP-COLLAPSE");

    await stack.lcaChecksQueue.pause();
    const first = await stack.lcaChecksQueue.add(
      "eligible_pending_lca_checks",
      { enqueuedAt: new Date().toISOString() },
      { jobId: "eligible_pending_lca_checks", removeOnComplete: true },
    );
    const second = await stack.lcaChecksQueue.add(
      "eligible_pending_lca_checks",
      { enqueuedAt: new Date().toISOString() },
      { jobId: "eligible_pending_lca_checks", removeOnComplete: true },
    );

    // BullMQ answers the SAME job for the second add rather than queueing another.
    expect(second.id).toBe(first.id);
    expect(await stack.lcaChecksQueue.getWaitingCount()).toBe(1);

    await stack.lcaChecksQueue.resume();

    // And once it has run, removeOnComplete frees the id so the next tick gets through.
    await stack.enqueueLcaChecksAndWait();
  });
});
