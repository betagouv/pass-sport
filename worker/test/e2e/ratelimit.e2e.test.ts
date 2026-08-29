import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, TEMPLATE_IDS, type Stack } from "./harness";
import type { Allowance } from "../../src/eligibility/types";

// Verifies the worker's rate-limit behaviour end-to-end: when API Particulier
// returns 429, the job is PAUSED (not failed) and only retried after the window
// indicated by the response's Retry-After header — then completes.

const RETRY_AFTER = 2; // seconds the mock's forced 429 asks the worker to wait

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ first429RetryAfter: RETRY_AFTER });
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const job = () => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15", // age 22 at 2026-12-31 -> CROUS eligible
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
  },
  aides: ["CROUS"] as Allowance[],
  isFranceConnected: true,
  residenceInsee: "75113",
});

describe("rate-limit pause + retry-from-header", () => {
  it("pauses on 429 and only retries after Retry-After, without failing", async () => {
    const t0 = Date.now();
    const returnValue = await stack.enqueueAndWait(job());
    const elapsedMs = Date.now() - t0;

    // The job completed (it retried after the pause) and was NOT counted as failed
    // — RateLimitError requeues without a failed attempt.
    expect(returnValue).toBeTruthy();
    expect(await stack.queue.getFailedCount()).toBe(0);

    // It honored the header: the retry happened ~Retry-After later, not immediately.
    // A hardcoded 1s default would land < 1.8s, so this proves the pause is
    // header-driven (Retry-After = 2s).
    expect(elapsedMs).toBeGreaterThanOrEqual((RETRY_AFTER - 0.2) * 1000);

    // And it eventually succeeded end-to-end.
    const rows = (await stack.pool.query("select * from eligibility_results")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].lca_status).toBe("confirmed");
  });

  it("leaves both the 429 and the resumed attempt in the history", async () => {
    const events = (
      await stack.pool.query("select * from eligibility_history order by created_at, id")
    ).rows;

    // The 429 is recorded BEFORE the RateLimitError is thrown — otherwise the pause
    // would carry off the one event that explains the delay.
    const limited = events.find((e) => e.status === "rate_limited");
    expect(limited).toBeDefined();
    expect(limited.actor).toBe("api_particulier");
    expect(limited.attempt).toBe(0);
    expect(limited.http_status).toBe(429);
    expect(limited.response_payload.retry_after).toBe(RETRY_AFTER);

    // The resumed call is a second row for the SAME action: the 429 never reached the
    // checkpoint, so it is re-called rather than skipped.
    const cnous = events.filter((e) => e.action === "cnous.etudiant_boursier_identite");
    expect(cnous.map((e) => e.status)).toEqual(["rate_limited", "success"]);

    // Both at attempt 0, and that is correct: RateLimitError requeues WITHOUT counting
    // a failed attempt (see getFailedCount above), so attemptsMade never moves. `attempt`
    // separates real retries; a rate-limit resume is read from the status sequence.
    expect(cnous.every((e) => e.attempt === 0)).toBe(true);
  });

  // attemptsMade stays 0 across a resume (see above), so a guard built on it would re-mail
  // every time the window closes. The flag lives on job.data instead.
  it("mails the accusé de réception once, not once per resume", async () => {
    const acks = stack
      .parsedEmails()
      .filter((e) => e.templateId === String(TEMPLATE_IDS.acknowledgment));
    expect(acks).toHaveLength(1);

    const traced = (
      await stack.pool.query(
        "select * from eligibility_history where action = 'email.acknowledgment'",
      )
    ).rows;
    expect(traced).toHaveLength(1);
    expect(traced[0].status).toBe("success");
  });
});
