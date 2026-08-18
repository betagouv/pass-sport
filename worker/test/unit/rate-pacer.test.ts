import { describe, expect, it } from "vitest";
import { RatePacer, isParisNightAt, parisHourAt } from "../../src/scripts/rate-pacer";

const ms = (iso: string): number => new Date(iso).getTime();

// sleep advances the clock instead of waiting, so a full day of pacing runs instantly.
const fakeClock = (startIso: string) => {
  let currentMs = ms(startIso);
  return {
    now: () => currentMs,
    sleep: async (waitMs: number) => {
      currentMs += waitMs;
    },
  };
};

const acquireMany = async (pacer: RatePacer, count: number): Promise<void> => {
  for (let i = 0; i < count; i++) await pacer.acquire();
};

describe("isParisNightAt", () => {
  it("converts to Paris time in winter (UTC+1)", () => {
    expect(parisHourAt(ms("2026-01-15T20:00:00Z"))).toBe(21);
    expect(isParisNightAt(ms("2026-01-15T20:00:00Z"))).toBe(true);
    expect(isParisNightAt(ms("2026-01-15T19:59:00Z"))).toBe(false);
  });

  it("converts to Paris time in summer (UTC+2)", () => {
    expect(parisHourAt(ms("2026-07-15T19:00:00Z"))).toBe(21);
    expect(isParisNightAt(ms("2026-07-15T19:00:00Z"))).toBe(true);
    expect(isParisNightAt(ms("2026-07-15T18:59:00Z"))).toBe(false);
  });

  it("spans midnight", () => {
    expect(parisHourAt(ms("2026-01-15T23:00:00Z"))).toBe(0);
    expect(isParisNightAt(ms("2026-01-15T23:00:00Z"))).toBe(true);
    expect(isParisNightAt(ms("2026-01-16T02:00:00Z"))).toBe(true);
  });

  it("hands back to the day rate at 08:00 Paris", () => {
    expect(isParisNightAt(ms("2026-01-15T06:59:00Z"))).toBe(true);
    expect(isParisNightAt(ms("2026-01-15T07:00:00Z"))).toBe(false);
  });
});

describe("RatePacer", () => {
  const noon = "2026-01-15T11:00:00Z";

  it("rejects a rate below 1, which acquire() could never satisfy", () => {
    const clock = fakeClock(noon);

    expect(() => new RatePacer({ dayRatePerMinute: 0, nightRatePerMinute: 500, ...clock })).toThrow(
      /at least 1 call per minute/,
    );
    expect(() => new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 0, ...clock })).toThrow(
      /at least 1 call per minute/,
    );
    expect(() => new RatePacer({ dayRatePerMinute: 1, nightRatePerMinute: 1, ...clock })).not.toThrow();
  });

  it("returns after at most one window wait", async () => {
    const clock = fakeClock("2026-01-15T11:00:37.500Z");
    let sleeps = 0;
    const pacer = new RatePacer({
      dayRatePerMinute: 200,
      nightRatePerMinute: 500,
      now: clock.now,
      sleep: async (waitMs) => {
        sleeps += 1;
        expect(waitMs).toBeGreaterThan(0);
        await clock.sleep(waitMs);
      },
    });

    for (let i = 0; i < 1000; i++) {
      const before = sleeps;
      await pacer.acquire();
      expect(sleeps - before).toBeLessThanOrEqual(1);
    }
  });

  it("lets the first rate calls through without waiting", async () => {
    const clock = fakeClock(noon);
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    await acquireMany(pacer, 200);

    expect(clock.now() - ms(noon)).toBe(0);
  });

  it("waits a full window before exceeding the rate", async () => {
    const clock = fakeClock(noon);
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    await acquireMany(pacer, 201);

    expect(clock.now() - ms(noon)).toBe(60_000);
  });

  it("grants exactly one quota per wall-clock minute", async () => {
    const clock = fakeClock(noon);
    const callsPerWindow = new Map<number, number>();
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    for (let i = 0; i < 1000; i++) {
      await pacer.acquire();
      const windowStartMs = Math.floor(clock.now() / 60_000) * 60_000;
      callsPerWindow.set(windowStartMs, (callsPerWindow.get(windowStartMs) ?? 0) + 1);
    }

    expect([...callsPerWindow.values()]).toEqual([200, 200, 200, 200, 200]);
  });

  it("starts a fresh quota on the minute, mid-window", async () => {
    const lateInWindow = "2026-01-15T11:00:59.000Z";
    const clock = fakeClock(lateInWindow);
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    await acquireMany(pacer, 200);
    expect(clock.now() - ms(lateInWindow)).toBe(0);

    // The remaining second of the 11:00 window is all it waits: 11:01 grants a new quota.
    await acquireMany(pacer, 200);
    expect(clock.now() - ms(lateInWindow)).toBe(1_000);
  });

  it("uses the night rate inside the Paris night window", async () => {
    const nightStart = "2026-01-15T22:00:00Z";
    const clock = fakeClock(nightStart);
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    await acquireMany(pacer, 500);

    expect(clock.now() - ms(nightStart)).toBe(0);
  });

  it("reports each rate transition once", async () => {
    const clock = fakeClock("2026-01-15T19:58:00Z");
    const transitions: number[] = [];
    const pacer = new RatePacer({
      dayRatePerMinute: 200,
      nightRatePerMinute: 500,
      ...clock,
      onRateChange: (ratePerMinute) => transitions.push(ratePerMinute),
    });

    await acquireMany(pacer, 1000);

    expect(transitions).toEqual([200, 500]);
  });

  it("throttles back down when the night window ends", async () => {
    const beforeDawn = "2026-01-15T06:59:00Z";
    const clock = fakeClock(beforeDawn);
    const pacer = new RatePacer({ dayRatePerMinute: 200, nightRatePerMinute: 500, ...clock });

    await acquireMany(pacer, 500);
    expect(clock.now() - ms(beforeDawn)).toBe(0);

    await pacer.acquire();

    expect(isParisNightAt(clock.now())).toBe(false);
    expect(clock.now() - ms(beforeDawn)).toBe(60_000);
  });
});
