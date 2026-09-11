import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";

// What a 429 costs mid-chain. The checkpoint has to replay each committed answer to the call that
// produced it — and the quotient sweep is where that is easy to get wrong: every month shares one
// `resource` and carries no childIndex, so nothing but the checkpoint key tells two months apart.
//
// The 429 lands on the THIRD call, i.e. after two quotient months have been committed. With the
// 429 on the first call (ratelimit.e2e.test.ts) nothing is ever committed before the pause, so
// the resume has nothing to replay and this whole class of bug stays invisible.

const RETRY_AFTER = 2;

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ first429RetryAfter: RETRY_AFTER, apiRateLimitOnCall: 3 });
  // Décembre: the sweep covers août..décembre, so a month that wrongly fails to stop the loop
  // leaves later months to be called and to become the deciding answer.
  stack.setNow(new Date("2026-12-15T12:00:00Z"));
  // Août is above the threshold, septembre under it: the loop must stop on septembre and stay
  // stopped across the resume.
  stack.setQfValeurByMois({ "8": 900, "9": 650, "10": 1000, "11": 1000, "12": 1000 });
  // AEEH answers no, so septembre's quotient is the only thing that can carry these children —
  // losing it is losing their pass, not merely falling back to another route.
  stack.setAeehBeneficiaire(false);
}, 180_000);

afterAll(async () => {
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
    sub: "fc-sub-checkpoint-resume",
  },
  isFranceConnected: true,
});

describe("resuming a rate-limited job", () => {
  beforeAll(async () => {
    await stack.enqueueAndWait(job());
  }, 120_000);

  it("completes without counting a failed attempt", async () => {
    expect(await stack.queue.getFailedCount()).toBe(0);
  });

  it("replays each swept month as itself, so the loop stays stopped on the qualifying one", async () => {
    const swept = (
      await stack.pool.query(
        `select body_payload ->> 'mois' as mois, status
           from eligibility_history
          where action = 'dss.quotient_familial_identite' and status <> 'skipped'
          order by created_at, id`,
      )
    ).rows;

    // Août once (429 then its retry would show here too, but the 429 lands on AAH), septembre
    // once. Octobre to décembre are never called: septembre ended the sweep, and the resume has
    // to reach the same conclusion from the checkpoint.
    expect(swept.map((r) => r.mois)).toEqual(["8", "9"]);
  });

  // The harm the whole thing guards against: losing septembre across the resume means these two
  // children are written not_eligible for a quotient that did qualify them.
  it("still carries the children septembre qualified", async () => {
    const enfants = (
      await stack.pool.query(
        "select enfant_identite, verdict from eligibility_results where source = 'enfant'",
      )
    ).rows;

    // 2009 (17 ans) and 2012 (14 ans) sit in the QF window, and septembre's 650 carries them.
    const byBirthdate = Object.fromEntries(
      enfants.map((r) => [r.enfant_identite?.birthdate, r.verdict]),
    );

    expect(byBirthdate["2009-01-01"]).toBe("eligible_pending");
    expect(byBirthdate["2012-01-01"]).toBe("eligible_pending");
  });

  it("spares the quotient calls it had already paid for", async () => {
    const skipped = (
      await stack.pool.query(
        `select count(*)::int as n
           from eligibility_history
          where action = 'dss.quotient_familial_identite' and status = 'skipped'`,
      )
    ).rows[0].n;

    // Both committed months are replayed from the checkpoint rather than re-billed.
    expect(skipped).toBe(2);
  });
});
