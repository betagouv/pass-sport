export const PARIS_NIGHT_START_HOUR = 21;
export const PARIS_NIGHT_END_HOUR = 8;

// 1 minute window
const WINDOW_MS = 60_000;

// Nothing here is displayed: the output is parsed straight back into a number, and
// timeZone alone carries the Paris semantics. en-GB is what renders a bare "21" — fr-FR
// renders "21 h", whose trailing literal makes Number() NaN, and NaN compares false on
// both night bounds, so the night rate would silently never apply.
// hourCycle h23 rather than hour12:false: depending on the Node version, midnight comes out as "24".
const parisHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  hourCycle: "h23",
});

export const parisHourAt = (timestampMs: number): number =>
  Number(parisHourFormatter.format(new Date(timestampMs)));

export const isParisNightAt = (timestampMs: number): boolean => {
  const hour = parisHourAt(timestampMs);
  return hour >= PARIS_NIGHT_START_HOUR || hour < PARIS_NIGHT_END_HOUR;
};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type RatePacerOptions = {
  dayRatePerMinute: number;
  nightRatePerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRateChange?: (ratePerMinute: number, isNight: boolean) => void;
};

// Fixed window aligned on wall-clock minutes: each minute grants a whole new quota. The
// counter is therefore allowed to burst up to two quotas across a boundary (rate calls at
// 11:00:59, rate more at 11:01:00) — the API's own 429 stays the backstop for that.
export class RatePacer {
  private readonly dayRatePerMinute: number;
  private readonly nightRatePerMinute: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRateChange: (ratePerMinute: number, isNight: boolean) => void;
  private lastReportedRatePerMinute = 0;
  private windowStartMs = -1;
  private callsInWindow = 0;

  constructor(options: RatePacerOptions) {
    // Below 1, acquire() can never let a call through and would sleep from window to window
    // forever. Checked here so the loop terminates by construction, whatever the caller does.
    if (options.dayRatePerMinute < 1 || options.nightRatePerMinute < 1) {
      throw new Error(
        "RatePacer: rate must be at least 1 call per minute " +
          `(day=${options.dayRatePerMinute}, night=${options.nightRatePerMinute})`,
      );
    }

    this.dayRatePerMinute = options.dayRatePerMinute;
    this.nightRatePerMinute = options.nightRatePerMinute;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? realSleep;
    this.onRateChange = options.onRateChange ?? (() => {});
  }

  ratePerMinuteAt(timestampMs: number): number {
    return isParisNightAt(timestampMs) ? this.nightRatePerMinute : this.dayRatePerMinute;
  }

  async acquire(): Promise<void> {
    while (true) {
      const nowMs = this.now();
      const ratePerMinute = this.reportRateChange(nowMs);
      const windowStartMs = Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;

      if (windowStartMs !== this.windowStartMs) {
        this.windowStartMs = windowStartMs;
        this.callsInWindow = 0;
      }

      if (this.callsInWindow < ratePerMinute) {
        this.callsInWindow += 1;
        return;
      }

      await this.sleep(windowStartMs + WINDOW_MS - nowMs);
    }
  }

  private reportRateChange(nowMs: number): number {
    const ratePerMinute = this.ratePerMinuteAt(nowMs);

    if (ratePerMinute !== this.lastReportedRatePerMinute) {
      this.lastReportedRatePerMinute = ratePerMinute;
      this.onRateChange(ratePerMinute, isParisNightAt(nowMs));
    }

    return ratePerMinute;
  }
}
