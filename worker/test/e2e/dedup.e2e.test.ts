import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startStack, type Stack } from "./harness";
import { CODES_JOB_NAME } from "../../src";
import type { Allowance } from "../../src/eligibility/types";

// Design A: a FranceConnect user's job id IS their pairwise `sub`, so disconnecting
// and reconnecting cannot create a second job for the same person. These tests pin
// the BullMQ semantics that assumption rests on.

let stack: Stack;

beforeAll(async () => {
  stack = await startStack();
}, 180_000);

afterAll(async () => {
  await stack?.close();
});

const input = () => ({
  identity: {
    family_name: "Martin",
    given_name: "Camille",
    birthdate: "2004-05-15",
    gender: "female" as const,
    birthplace: "75056",
    birthcountry: "99100",
    email: "camille.martin@example.test",
  },
  aides: ["CROUS"] as Allowance[],
  isFranceConnected: true,
  residenceInsee: "75113",
});

// The site's only window onto Postgres: the SELECT-only view.
const applicationsFor = async (sub: string) =>
  (await stack.pool.query("select * from applications_by_sub where sub = $1", [sub])).rows;

const settle = async (id: string) => {
  for (let i = 0; i < 100; i++) {
    const state = await (await stack.queue.getJob(id))?.getState();
    if (state === "completed" || state === "failed") return state;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${id} did not settle`);
};

describe("job dedup by FranceConnect sub", () => {
  it("a second add under the same sub does not create a second job", async () => {
    const sub = "sub-dedup-1";
    const first = await stack.queue.add(CODES_JOB_NAME, input(), {
      jobId: sub,
    });
    expect(first.id).toBe(sub);
    await settle(sub);

    // Reconnect: same sub, a fresh signed payload. BullMQ must return the existing job.
    const second = await stack.queue.add(CODES_JOB_NAME, input(), {
      jobId: sub,
    });
    expect(second.id).toBe(sub);

    const counts = await stack.queue.getJobCounts();
    const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBe(1);
  });

  it("the job is retrievable by sub after it completes", async () => {
    const sub = "sub-dedup-2";
    await stack.queue.add(CODES_JOB_NAME, input(), { jobId: sub });
    expect(await settle(sub)).toBe("completed");

    // This is what the site's findJobForSub does on reconnect.
    const found = await stack.queue.getJob(sub);
    expect(found).toBeTruthy();
    expect(await found!.getState()).toBe("completed");
  });

  it("a different sub still gets its own job", async () => {
    await stack.queue.add(CODES_JOB_NAME, input(), {
      jobId: "sub-other",
    });
    expect(await settle("sub-other")).toBe("completed");
    expect(await stack.queue.getJob("sub-other")).toBeTruthy();
  });

  it("returns nothing for a sub that never submitted", async () => {
    expect(await stack.queue.getJob("sub-never-seen")).toBeUndefined();
    expect(await applicationsFor("sub-never-seen")).toHaveLength(0);
  });

  it("exposes the application to the site after the job record is gone", async () => {
    const sub = "sub-marker-1";
    await stack.enqueueAndWait({ ...input(), identity: { ...input().identity, sub } });

    // What the site reads once BullMQ has aged the job out: the view, not the queue.
    const [row] = await applicationsFor(sub);
    expect(row).toBeTruthy();
    expect(Number.isNaN(Date.parse(String(row.last_application)))).toBe(false);

    // The view must expose no identity — only the opaque pseudonym and timestamps.
    const serialized = JSON.stringify(row);
    for (const secret of ["Martin", "Camille", "2004-05-15", "camille.martin@example.test"]) {
      expect(serialized).not.toContain(secret);
    }

    // Survives the BullMQ record disappearing, which is the whole point.
    const job = await stack.queue.getJob(sub);
    await job?.remove();
    expect(await stack.queue.getJob(sub)).toBeUndefined();
    expect(await applicationsFor(sub)).toHaveLength(1);
  });

  it("exposes nothing for a request with no FranceConnect sub", async () => {
    const before = (await stack.pool.query("select * from applications_by_sub")).rows.length;
    await stack.enqueueAndWait(input()); // identity carries no `sub`
    const after = (await stack.pool.query("select * from applications_by_sub")).rows.length;
    expect(after).toBe(before);
  });
});
