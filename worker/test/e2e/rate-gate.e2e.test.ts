import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Redis } from "ioredis";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import {
  CONFIG_KEYS,
  createRedisRateGate,
  minuteCounterKeyAt,
  secondCounterKeyAt,
  type ApiParticulierRateGate,
} from "../../src/eligibility/rate-gate";

// Against a real Redis: ceilings, counters and their atomicity all live in a Lua script, so
// nothing here can be proven against a stub.

const NOON = new Date("2026-09-15T10:00:00Z").getTime(); // 12h Paris, jour
const NIGHT = new Date("2026-09-15T20:00:00Z").getTime(); // 22h Paris, nuit

let container: StartedRedisContainer;
let redis: Redis;
let nowMs = NOON;

const gate = (options: Parameters<typeof createRedisRateGate>[1] = {}): ApiParticulierRateGate =>
  createRedisRateGate(redis, {
    fallbackCallsPerSecond: 1_000,
    fallbackDayCallsPerMinute: 1_000,
    fallbackNightCallsPerMinute: 1_000,
    now: () => nowMs,
    ...options,
  });

beforeAll(async () => {
  container = await new RedisContainer("redis:8-alpine").start();
  redis = new Redis(container.getConnectionUrl());
}, 180_000);

afterAll(async () => {
  await redis?.quit().catch(() => {});
  await container?.stop();
});

beforeEach(async () => {
  await redis.flushall();
  nowMs = NOON;
});

describe("minute window", () => {
  it("lets the ceiling through and refuses the next call until the window rolls over", async () => {
    const limiter = gate({ fallbackDayCallsPerMinute: 3 });

    for (let i = 0; i < 3; i++) {
      expect((await limiter.take()).allowed).toBe(true);
    }

    const refused = await limiter.take();

    expect(refused).toMatchObject({ allowed: false, blockedBy: "minute", perMinute: 3 });
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryInMs).toBeGreaterThan(0);
      expect(refused.retryInMs).toBeLessThanOrEqual(60_000);
    }

    nowMs += 60_000;
    expect((await limiter.take()).allowed).toBe(true);
  });
});

describe("second window", () => {
  it("refuses past the per-second ceiling, and frees up a second later", async () => {
    const limiter = gate({ fallbackCallsPerSecond: 2 });

    expect((await limiter.take()).allowed).toBe(true);
    expect((await limiter.take()).allowed).toBe(true);

    const refused = await limiter.take();

    expect(refused).toMatchObject({ allowed: false, blockedBy: "second", perSecond: 2 });
    if (!refused.allowed) expect(refused.retryInMs).toBeLessThanOrEqual(1_000);

    nowMs += 1_000;
    expect((await limiter.take()).allowed).toBe(true);
  });

  // Otherwise a burst would eat the minute budget without a single call ever going out.
  it("does not spend a minute token on a call it refused", async () => {
    const limiter = gate({ fallbackCallsPerSecond: 2 });

    await limiter.take();
    await limiter.take();
    await limiter.take();
    await limiter.take();

    expect(await redis.get(minuteCounterKeyAt(nowMs))).toBe("2");
  });
});

describe("counter keys", () => {
  it("expire on their own, two windows out", async () => {
    await gate().take();

    const secondTtl = await redis.pttl(secondCounterKeyAt(nowMs));
    const minuteTtl = await redis.pttl(minuteCounterKeyAt(nowMs));

    expect(secondTtl).toBeGreaterThan(0);
    expect(secondTtl).toBeLessThanOrEqual(2_000);
    expect(minuteTtl).toBeGreaterThan(0);
    expect(minuteTtl).toBeLessThanOrEqual(120_000);
  });
});

describe("ceilings configured in Redis", () => {
  // The point of keeping them in Redis: the change lands on the next call, not the next deploy.
  it("applies a new value without rebuilding the gate", async () => {
    const limiter = gate({ fallbackDayCallsPerMinute: 1_000 });

    expect(await limiter.take()).toMatchObject({ allowed: true, perMinute: 1_000 });

    await redis.set(CONFIG_KEYS.perMinuteDay, "1");

    expect(await limiter.take()).toMatchObject({ allowed: false, blockedBy: "minute", perMinute: 1 });
  });

  it("hands back to the fallback when the key is deleted", async () => {
    const limiter = gate({ fallbackDayCallsPerMinute: 7 });

    await redis.set(CONFIG_KEYS.perMinuteDay, "1");
    expect(await limiter.take()).toMatchObject({ perMinute: 1 });

    await redis.del(CONFIG_KEYS.perMinuteDay);
    expect(await limiter.take()).toMatchObject({ perMinute: 7 });
  });

  // A typo must neither stop the chain (0) nor lift the ceiling (garbage).
  it.each(["abc", "0", "-3", ""])("ignores the unusable value %j", async (value) => {
    const limiter = gate({ fallbackDayCallsPerMinute: 7 });

    await redis.set(CONFIG_KEYS.perMinuteDay, value);

    expect(await limiter.take()).toMatchObject({ allowed: true, perMinute: 7 });
  });

  it("reads the night key at night and the day key by day", async () => {
    const limiter = gate({ fallbackDayCallsPerMinute: 7, fallbackNightCallsPerMinute: 9 });

    await redis.set(CONFIG_KEYS.perMinuteDay, "11");
    await redis.set(CONFIG_KEYS.perMinuteNight, "22");

    expect(await limiter.take()).toMatchObject({ perMinute: 11, isNight: false });

    nowMs = NIGHT;
    expect(await limiter.take()).toMatchObject({ perMinute: 22, isNight: true });
  });

  it("reports every change of the applied ceilings exactly once", async () => {
    const changes: { perSecond: number; perMinute: number; isNight: boolean }[] = [];
    const limiter = gate({ fallbackDayCallsPerMinute: 7, onLimitsChange: (l) => changes.push(l) });

    await limiter.take();
    await limiter.take();
    await redis.set(CONFIG_KEYS.perMinuteDay, "5");
    await limiter.take();

    expect(changes).toEqual([
      { perSecond: 1_000, perMinute: 7, isNight: false },
      { perSecond: 1_000, perMinute: 5, isNight: false },
    ]);
  });
});
