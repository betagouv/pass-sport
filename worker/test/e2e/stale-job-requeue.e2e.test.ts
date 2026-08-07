import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import {
  API_PARTICULIER_QUEUE_NAME,
  EMAIL_VERIFICATION_QUEUE_NAME,
  FRANCE_CONNECT_QUEUE_NAME,
} from "../../src/queues";

// Pins the BullMQ semantics every producer depends on now that there are no dead-letter
// queues: a job that exhausted its attempts stays in `failed` on its own queue for
// removeOnFail (24h) and keeps holding its id — and add() for an existing id is a silent
// no-op that DISCARDS the new payload.
//
// With no DLQ, resubmitting is the ONLY way back. All three queues are keyed on a stable id
// (the FranceConnect `sub`, or the identity hash), so without the producer clearing that
// corpse first (site/src/app/services/queue.ts) every resubmission inside the 24h window
// would be swallowed and the usager left with nothing.

let container: StartedRedisContainer;
const connections: Redis[] = [];

beforeAll(async () => {
  container = await new RedisContainer("redis:8-alpine").start();
}, 180_000);

afterAll(async () => {
  await Promise.all(connections.map((c) => c.quit().catch(() => {})));
  await container?.stop();
});

const conn = (): Redis => {
  const client = new Redis(container.getConnectionUrl(), { maxRetriesPerRequest: null });
  client.on("error", () => {});
  connections.push(client);
  return client;
};

// Same options the site producer uses (attempts trimmed so the test does not wait on backoff).
const OPTS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 86_400 } };

// The producer's guard, mirrored: only a `failed` job is cleared.
const clearIfDead = async (queue: Queue, jobId: string): Promise<void> => {
  const job = await queue.getJob(jobId);
  if (job && (await job.getState()) === "failed") await job.remove();
};

// And the read side: a dead job must not count as an existing request.
const isDeadJob = async (queue: Queue, jobId: string): Promise<boolean> => {
  const job = await queue.getJob(jobId);
  return !!job && (await job.getState()) === "failed";
};

const exhaustAttempts = async (queueName: string, jobId: string): Promise<Queue> => {
  const queue = new Queue(queueName, { connection: conn() });
  const worker = new Worker(queueName, async () => {
    throw new Error("upstream unavailable");
  }, { connection: conn() });
  await worker.waitUntilReady();

  await queue.add("j", { attempt: "first" }, { ...OPTS, jobId });
  for (let i = 0; i < 100; i++) {
    if ((await (await queue.getJob(jobId))?.getState()) === "failed") break;
    await new Promise((r) => setTimeout(r, 100));
  }

  await worker.close();
  return queue;
};

describe.each([
  { name: "france-connect", queueName: FRANCE_CONNECT_QUEUE_NAME, jobId: "fc-sub-abc" },
  { name: "api-particulier", queueName: API_PARTICULIER_QUEUE_NAME, jobId: "ap-hash" },
  { name: "email-verification", queueName: EMAIL_VERIFICATION_QUEUE_NAME, jobId: "ev-hash" },
])("$name", ({ queueName, jobId }) => {
  it("lets the usager resubmit after the job died", async () => {
    const queue = await exhaustAttempts(queueName, jobId);

    // Still holding the id, which is what makes both halves of the fix necessary.
    expect(await (await queue.getJob(jobId))?.getState()).toBe("failed");

    // Read side: a dead job must not be reported as an existing request, or the route 409s
    // and the resubmission never even reaches the producer.
    expect(await isDeadJob(queue, jobId)).toBe(true);

    // Write side: without the clear, the new payload is silently discarded.
    await queue.add("j", { attempt: "second" }, { ...OPTS, jobId });
    expect((await queue.getJob(jobId))?.data).toEqual({ attempt: "first" });

    await clearIfDead(queue, jobId);
    await queue.add("j", { attempt: "third" }, { ...OPTS, jobId });

    const requeued = await queue.getJob(jobId);
    expect(requeued?.data).toEqual({ attempt: "third" });
    expect(await requeued?.getState()).toBe("waiting");

    await queue.close();
  }, 120_000);

  it("still collapses a genuine double submit", async () => {
    const queue = new Queue(`${queueName}-live`, { connection: conn() });

    await queue.add("j", { attempt: "first" }, { ...OPTS, jobId });
    expect(await (await queue.getJob(jobId))?.getState()).toBe("waiting");

    // Alive, so the guard leaves it and add() collapses onto the job already queued.
    await clearIfDead(queue, jobId);
    await queue.add("j", { attempt: "second" }, { ...OPTS, jobId });

    expect((await queue.getJob(jobId))?.data).toEqual({ attempt: "first" });

    await queue.close();
  }, 120_000);
});
