import { describe, expect, it } from "vitest";
import {
  AdaptiveRatePacer,
  RatePacer,
  isParisNightAt,
  parisHourAt,
  type RateChange,
} from "../../src/scripts/rate-pacer";

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

  it("reports each rate transition once, with its cause", async () => {
    const clock = fakeClock("2026-01-15T19:58:00Z");
    const transitions: RateChange[] = [];
    const pacer = new RatePacer({
      dayRatePerMinute: 200,
      nightRatePerMinute: 500,
      ...clock,
      onRateChange: (change) => transitions.push(change),
    });

    await acquireMany(pacer, 1000);

    expect(transitions.map(({ previousRatePerMinute, ratePerMinute, reason, isNight }) => [
      previousRatePerMinute,
      ratePerMinute,
      reason,
      isNight,
    ])).toEqual([
      [0, 200, "start", false],
      [200, 500, "day-night", true],
    ]);
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

describe("AdaptiveRatePacer", () => {
  const noon = "2026-01-15T11:00:00Z";

  const makePacer = (clock: ReturnType<typeof fakeClock>, overrides = {}) =>
    new AdaptiveRatePacer({
      dayRatePerMinute: 200,
      nightRatePerMinute: 500,
      ...clock,
      ...overrides,
    });

  it("rejects a decrease factor outside (0, 1)", () => {
    const clock = fakeClock(noon);

    expect(() => makePacer(clock, { decreaseFactor: 0 })).toThrow(/decreaseFactor/);
    expect(() => makePacer(clock, { decreaseFactor: 1 })).toThrow(/decreaseFactor/);
    expect(() => makePacer(clock, { decreaseFactor: 0.5 })).not.toThrow();
  });

  it("starts at the initial rate, not the ceiling", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock);

    await acquireMany(pacer, 100);
    expect(clock.now() - ms(noon)).toBe(0);

    await pacer.acquire();
    expect(clock.now() - ms(noon)).toBe(60_000);
  });

  it("halves the rate on an error", () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock);

    expect(pacer.onError()).toBe(true);

    expect(pacer.ratePerMinuteAt(clock.now())).toBe(50);
  });

  it("absorbs a burst of errors into a single decrease", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock);

    expect(pacer.onError()).toBe(true);
    expect(pacer.onError()).toBe(false);
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(50);

    // Past the hold window, a fresh error decreases again.
    await clock.sleep(61_000);
    expect(pacer.onError()).toBe(true);
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(25);
  });

  it("never decreases below the floor", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, { initialRatePerMinute: 8, minRatePerMinute: 5 });

    pacer.onError();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(5);

    await clock.sleep(61_000);
    pacer.onError();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(5);
  });

  it("increases additively after enough consecutive successes", () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, { successesBeforeIncrease: 30, increaseStep: 5 });

    for (let i = 0; i < 29; i++) pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(100);

    pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(105);
  });

  it("resets the success streak on an error, even inside the hold window", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, { successesBeforeIncrease: 30, increaseStep: 5 });

    for (let i = 0; i < 29; i++) pacer.onSuccess();
    pacer.onError();
    pacer.onError();

    // The second error was absorbed by the hold, but the streak restarted from zero:
    // 30 more successes (past the 2 × hold recovery delay) are needed to climb again.
    await clock.sleep(121_000);
    for (let i = 0; i < 29; i++) pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(50);

    pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(55);
  });

  it("holds increases for twice the hold window after a decrease", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, { successesBeforeIncrease: 30, increaseStep: 5 });

    pacer.onError();

    await clock.sleep(90_000);
    for (let i = 0; i < 30; i++) pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(50);

    await clock.sleep(31_000);
    for (let i = 0; i < 30; i++) pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(clock.now())).toBe(55);
  });

  it("lets the adaptive rate exceed the day ceiling only at night", async () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, {
      initialRatePerMinute: 250,
      dayRatePerMinute: 200,
      nightRatePerMinute: 500,
    });

    expect(pacer.ratePerMinuteAt(ms(noon))).toBe(200);
    expect(pacer.ratePerMinuteAt(ms("2026-01-15T22:00:00Z"))).toBe(250);
  });

  it("caps additive increases at the highest ceiling", () => {
    const clock = fakeClock(noon);
    const pacer = makePacer(clock, {
      initialRatePerMinute: 498,
      successesBeforeIncrease: 1,
      increaseStep: 5,
    });

    pacer.onSuccess();
    expect(pacer.ratePerMinuteAt(ms("2026-01-15T22:00:00Z"))).toBe(500);
  });

  it("reports adaptive rate changes through onRateChange", async () => {
    const clock = fakeClock(noon);
    const transitions: RateChange[] = [];
    const pacer = makePacer(clock, {
      onRateChange: (change: RateChange) => transitions.push(change),
    });

    await pacer.acquire();
    pacer.onError();
    await pacer.acquire();

    expect(transitions.map(({ ratePerMinute, reason }) => [ratePerMinute, reason])).toEqual([
      [100, "start"],
      [50, "decrease"],
    ]);
  });

  it("reports a decrease as it happens, not at the next acquire", () => {
    const clock = fakeClock(noon);
    const transitions: RateChange[] = [];
    const pacer = makePacer(clock, {
      onRateChange: (change: RateChange) => transitions.push(change),
    });

    pacer.onError();

    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toMatchObject({ ratePerMinute: 100, reason: "start" });
    expect(transitions[1]).toMatchObject({
      previousRatePerMinute: 100,
      ratePerMinute: 50,
      ceilingPerMinute: 200,
      isNight: false,
      reason: "decrease",
      timestampMs: ms(noon),
    });
  });

  it("reports an increase, and stays silent for the errors absorbed by the hold", async () => {
    const clock = fakeClock(noon);
    const transitions: RateChange[] = [];
    const pacer = makePacer(clock, {
      successesBeforeIncrease: 2,
      increaseStep: 5,
      onRateChange: (change: RateChange) => transitions.push(change),
    });

    pacer.onError();
    pacer.onError();

    await clock.sleep(121_000);
    pacer.onSuccess();
    pacer.onSuccess();

    expect(transitions.map(({ ratePerMinute, reason }) => [ratePerMinute, reason])).toEqual([
      [100, "start"],
      [50, "decrease"],
      [55, "increase"],
    ]);
  });

  // The applied cadence is min(adaptive, ceiling): an adaptive move that stays above the
  // ceiling changes nothing in effect, so reporting it would be noise.
  it("stays silent while the adaptive rate is clamped by the ceiling", () => {
    const clock = fakeClock(noon);
    const transitions: RateChange[] = [];
    const pacer = makePacer(clock, {
      initialRatePerMinute: 500,
      successesBeforeIncrease: 1,
      onRateChange: (change: RateChange) => transitions.push(change),
    });

    pacer.onError();

    expect(pacer.ratePerMinuteAt(clock.now())).toBe(200);
    expect(transitions.map(({ ratePerMinute, reason }) => [ratePerMinute, reason])).toEqual([
      [200, "start"],
    ]);
  });
});
