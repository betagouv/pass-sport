import { afterEach, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// The gate seen from a job: a window it saturates must pause the chain, never fail it, and the
// calls already paid for must not be re-billed on the resume.

let stack: Stack;

afterEach(async () => {
  await stack?.close();
});

const job = () => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
  },
  isFranceConnected: true,
});

// A minute window really takes a minute to roll over, so the gate clock is walked from one
// window to the next, each time parked a second before its end: every refusal then costs the
// ~1 s the queue pause is worth, instead of the full minute.
const walkMinuteWindows = (): (() => void) => {
  const firstWindowEndMs = Math.floor(Date.now() / 60_000) * 60_000 + 59_000;
  let window = 0;
  const ticker = setInterval(() => {
    window += 1;
    stack.setGateNow(firstWindowEndMs + window * 60_000);
  }, 250);

  return () => clearInterval(ticker);
};

const gateEvents = async (blockedBy: string) => {
  const { rows } = await stack.pool.query(
    "select * from eligibility_history where action = 'rate_gate' order by created_at, id",
  );

  return rows.filter((row) => row.response_payload.blocked_by === blockedBy);
};

describe("rate gate on the eligibility chain", () => {
  it("pauses on a saturated minute window, resumes, and completes", async () => {
    stack = await startStack({ apiCallsPerMinute: 1 });
    const stopWalking = walkMinuteWindows();

    try {
      const returnValue = (await stack.enqueueAndWait(job())) as { apCalls: number };

      expect(returnValue).toBeTruthy();
      expect(await stack.queue.getFailedCount()).toBe(0);

      const paused = await gateEvents("minute");
      expect(paused.length).toBeGreaterThan(0);
      expect(paused[0].actor).toBe("worker");
      expect(paused[0].status).toBe("rate_limited");
      expect(paused[0].response_payload.limit_per_minute).toBe(1);
      expect(paused[0].response_payload.retry_after_ms).toBeGreaterThan(0);

      const rows = (
        await stack.pool.query("select * from eligibility_results where source = 'self'")
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].verdict).toBe("eligible_pending");

      const calls = (
        await stack.pool.query(
          "select status from eligibility_history where actor = 'api_particulier'",
        )
      ).rows;

      // As many billed calls as the chain has answers, whatever the number of pauses: the ones
      // a resume replays come back from the checkpoint as 'skipped'.
      const answered = calls.filter((row) => ["success", "not_found"].includes(row.status));
      expect(answered).toHaveLength(returnValue.apCalls);
      expect(calls.some((row) => row.status === "skipped")).toBe(true);
    } finally {
      stopWalking();
    }
  }, 180_000);

  it("pauses on a saturated second window too", async () => {
    stack = await startStack({ apiCallsPerSecond: 1 });

    const returnValue = await stack.enqueueAndWait(job());

    expect(returnValue).toBeTruthy();
    expect(await stack.queue.getFailedCount()).toBe(0);

    const paused = await gateEvents("second");
    expect(paused.length).toBeGreaterThan(0);
    expect(paused[0].response_payload.limit_per_second).toBe(1);
  }, 180_000);
});
