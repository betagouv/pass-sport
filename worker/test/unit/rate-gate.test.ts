import { describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  minuteConfigKeyAt,
  minuteCounterKeyAt,
  secondCounterKeyAt,
} from "../../src/eligibility/rate-gate";

const ms = (iso: string): number => new Date(iso).getTime();

describe("minuteConfigKeyAt", () => {
  it("reads the day ceiling between 8h and 21h Paris", () => {
    expect(minuteConfigKeyAt(ms("2026-01-15T11:00:00Z"))).toBe(CONFIG_KEYS.perMinuteDay);
    expect(minuteConfigKeyAt(ms("2026-01-15T07:00:00Z"))).toBe(CONFIG_KEYS.perMinuteDay); // 08h00 pile
    expect(minuteConfigKeyAt(ms("2026-01-15T19:59:59Z"))).toBe(CONFIG_KEYS.perMinuteDay); // 20h59
  });

  it("reads the night ceiling from 21h to 8h Paris", () => {
    expect(minuteConfigKeyAt(ms("2026-01-15T20:00:00Z"))).toBe(CONFIG_KEYS.perMinuteNight); // 21h00 pile
    expect(minuteConfigKeyAt(ms("2026-01-15T02:00:00Z"))).toBe(CONFIG_KEYS.perMinuteNight);
    expect(minuteConfigKeyAt(ms("2026-01-15T06:59:59Z"))).toBe(CONFIG_KEYS.perMinuteNight); // 07h59
  });

  it("follows DST", () => {
    // 19:00Z is 20h in winter (day) and 21h in summer (night) — the one instant that tells a
    // Paris reading apart from a UTC one.
    expect(minuteConfigKeyAt(ms("2026-01-15T19:00:00Z"))).toBe(CONFIG_KEYS.perMinuteDay);
    expect(minuteConfigKeyAt(ms("2026-07-15T19:00:00Z"))).toBe(CONFIG_KEYS.perMinuteNight);
    expect(minuteConfigKeyAt(ms("2026-07-15T18:59:00Z"))).toBe(CONFIG_KEYS.perMinuteDay); // 20h59
  });
});

describe("counter keys", () => {
  it("bucket by wall-clock second and minute", () => {
    const at = ms("2026-09-15T12:34:56.789Z");

    expect(secondCounterKeyAt(at)).toBe(secondCounterKeyAt(ms("2026-09-15T12:34:56.001Z")));
    expect(secondCounterKeyAt(at)).not.toBe(secondCounterKeyAt(ms("2026-09-15T12:34:57.000Z")));
    expect(minuteCounterKeyAt(at)).toBe(minuteCounterKeyAt(ms("2026-09-15T12:34:01.000Z")));
    expect(minuteCounterKeyAt(at)).not.toBe(minuteCounterKeyAt(ms("2026-09-15T12:35:00.000Z")));
  });

  it("never collides with the bull: namespace", () => {
    const at = ms("2026-09-15T12:34:56.789Z");

    expect(secondCounterKeyAt(at)).toMatch(/^apip:rate:s:\d+$/);
    expect(minuteCounterKeyAt(at)).toMatch(/^apip:rate:m:\d+$/);
  });
});
