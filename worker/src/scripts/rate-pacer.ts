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

// What moved the cadence. "start" is the first rate ever reported; "day-night" a change of
// ceiling at the Paris night boundary; "increase"/"decrease" an AIMD adjustment.
export type RateChangeReason = "start" | "day-night" | "increase" | "decrease";

export type RateChange = {
  ratePerMinute: number;
  previousRatePerMinute: number;
  ceilingPerMinute: number;
  isNight: boolean;
  reason: RateChangeReason;
  timestampMs: number;
};

export type RatePacerOptions = {
  dayRatePerMinute: number;
  nightRatePerMinute: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRateChange?: (change: RateChange) => void;
};

// Fixed window aligned on wall-clock minutes: each minute grants a whole new quota. The
// counter is therefore allowed to burst up to two quotas across a boundary (rate calls at
// 11:00:59, rate more at 11:01:00) — the API's own 429 stays the backstop for that.
export class RatePacer {
  private readonly dayRatePerMinute: number;
  private readonly nightRatePerMinute: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRateChange: (change: RateChange) => void;
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

  ceilingPerMinuteAt(timestampMs: number): number {
    return isParisNightAt(timestampMs) ? this.nightRatePerMinute : this.dayRatePerMinute;
  }

  ratePerMinuteAt(timestampMs: number): number {
    return this.ceilingPerMinuteAt(timestampMs);
  }

  async acquire(): Promise<void> {
    while (true) {
      const nowMs = this.now();
      // Any AIMD move is reported as it happens, so a change noticed here can only come
      // from the ceiling switching at the Paris night boundary.
      const ratePerMinute = this.reportRateChange(nowMs, "day-night");
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

  protected reportRateChange(nowMs: number, reason: RateChangeReason): number {
    const ratePerMinute = this.ratePerMinuteAt(nowMs);

    if (ratePerMinute !== this.lastReportedRatePerMinute) {
      const previousRatePerMinute = this.lastReportedRatePerMinute;
      this.lastReportedRatePerMinute = ratePerMinute;
      this.onRateChange({
        ratePerMinute,
        previousRatePerMinute,
        ceilingPerMinute: this.ceilingPerMinuteAt(nowMs),
        isNight: isParisNightAt(nowMs),
        reason: previousRatePerMinute === 0 ? "start" : reason,
        timestampMs: nowMs,
      });
    }

    return ratePerMinute;
  }
}

export type AimdOptions = {
  initialRatePerMinute?: number;
  minRatePerMinute?: number;
  increaseStep?: number;
  decreaseFactor?: number;
  successesBeforeIncrease?: number;
  decreaseHoldMs?: number;
};

// Conservative defaults, tuned to prefer few throttle/instability errors over peak
// throughput: the rate climbs by +5/min every 30 clean calls and halves on the first
// error signal, so one probe error costs on the order of 30 × (rate / 5) successes.
const AIMD_DEFAULTS: Required<AimdOptions> = {
  initialRatePerMinute: 100,
  minRatePerMinute: 5,
  increaseStep: 5,
  decreaseFactor: 0.30,
  successesBeforeIncrease: 10,
  decreaseHoldMs: 60_000,
};

// AIMD (additive increase, multiplicative decrease) on top of the fixed-window pacing:
// the day/night rates become ceilings, and the effective rate converges in a sawtooth
// just under whatever the API actually sustains. The caller reports outcomes through
// onSuccess()/onError(); acquire() is inherited and picks up the adjusted rate.
export class AdaptiveRatePacer extends RatePacer {
  private readonly minRatePerMinute: number;
  private readonly maxRatePerMinute: number;
  private readonly increaseStep: number;
  private readonly decreaseFactor: number;
  private readonly successesBeforeIncrease: number;
  private readonly decreaseHoldMs: number;
  private readonly nowMs: () => number;
  private adaptiveRate: number;
  private consecutiveSuccesses = 0;
  private lastDecreaseMs = Number.NEGATIVE_INFINITY;

  constructor(options: RatePacerOptions & AimdOptions) {
    super(options);

    this.minRatePerMinute = options.minRatePerMinute ?? AIMD_DEFAULTS.minRatePerMinute;
    this.increaseStep = options.increaseStep ?? AIMD_DEFAULTS.increaseStep;
    this.decreaseFactor = options.decreaseFactor ?? AIMD_DEFAULTS.decreaseFactor;
    this.successesBeforeIncrease =
      options.successesBeforeIncrease ?? AIMD_DEFAULTS.successesBeforeIncrease;
    this.decreaseHoldMs = options.decreaseHoldMs ?? AIMD_DEFAULTS.decreaseHoldMs;
    this.nowMs = options.now ?? Date.now;

    if (this.minRatePerMinute < 1) {
      throw new Error(`AdaptiveRatePacer: minRatePerMinute must be at least 1 (got ${this.minRatePerMinute})`);
    }
    if (this.decreaseFactor <= 0 || this.decreaseFactor >= 1) {
      throw new Error(`AdaptiveRatePacer: decreaseFactor must be in (0, 1) (got ${this.decreaseFactor})`);
    }
    if (this.increaseStep < 1 || this.successesBeforeIncrease < 1) {
      throw new Error(
        "AdaptiveRatePacer: increaseStep and successesBeforeIncrease must be at least 1 " +
          `(got ${this.increaseStep}, ${this.successesBeforeIncrease})`,
      );
    }

    // The adaptive rate may exceed the day ceiling so the night window can use it; the
    // clamp in ratePerMinuteAt is what enforces the ceiling in effect at call time.
    this.maxRatePerMinute = Math.max(options.dayRatePerMinute, options.nightRatePerMinute);
    this.adaptiveRate = Math.max(
      this.minRatePerMinute,
      Math.min(
        options.initialRatePerMinute ?? AIMD_DEFAULTS.initialRatePerMinute,
        this.maxRatePerMinute,
      ),
    );

    // Reported up front so the log opens on the cadence in effect. Otherwise the first
    // adjustment would be the first line printed, and a decrease would read as the
    // starting cadence rather than as a drop.
    this.reportRateChange(this.nowMs(), "start");
  }

  override ratePerMinuteAt(timestampMs: number): number {
    return Math.min(this.adaptiveRate, super.ratePerMinuteAt(timestampMs));
  }

  // A clean API answer (a QF value, or a genuine not-found). Additive increase, held
  // back for 2 × decreaseHoldMs after a decrease so residual errors from the same burst
  // do not race the recovery.
  onSuccess(): void {
    this.consecutiveSuccesses += 1;
    const clearOfLastDecrease = this.nowMs() - this.lastDecreaseMs > 2 * this.decreaseHoldMs;

    if (this.consecutiveSuccesses >= this.successesBeforeIncrease && clearOfLastDecrease) {
      this.adaptiveRate = Math.min(this.maxRatePerMinute, this.adaptiveRate + this.increaseStep);
      this.consecutiveSuccesses = 0;
      // Reported here rather than at the next acquire() so the log timestamps the change
      // itself. Silent while the adaptive rate stays above the ceiling in effect: the
      // cadence actually applied has not moved.
      this.reportRateChange(this.nowMs(), "increase");
    }
  }

  // A throttle/instability signal (429, or 404 "Erreur inattendue"). Multiplicative
  // decrease, at most once per decreaseHoldMs: errors inside the hold share one cause,
  // and halving on each would collapse the rate to the floor on a single incident.
  // Returns whether the rate actually moved, so the caller can log it.
  onError(): boolean {
    this.consecutiveSuccesses = 0;

    if (this.nowMs() - this.lastDecreaseMs <= this.decreaseHoldMs) return false;

    this.adaptiveRate = Math.max(
      this.minRatePerMinute,
      Math.floor(this.adaptiveRate * this.decreaseFactor),
    );
    this.lastDecreaseMs = this.nowMs();
    this.reportRateChange(this.lastDecreaseMs, "decrease");
    return true;
  }
}
