import type { Redis } from "ioredis";
import { positiveNumberFromEnv } from "../env";
import { isParisNightAt } from "../paris-time";

const SECOND_MS = 1_000;
const MINUTE_MS = 60_000;

// Two windows each, so a PEXPIRE lost to a crash cannot leave a counter behind forever.
const SECOND_KEY_TTL_MS = 2 * SECOND_MS;
const MINUTE_KEY_TTL_MS = 2 * MINUTE_MS;

const CONFIG_PER_SECOND_KEY = "apip:rate:config:per_second";
const CONFIG_PER_MINUTE_DAY_KEY = "apip:rate:config:per_minute_day";
const CONFIG_PER_MINUTE_NIGHT_KEY = "apip:rate:config:per_minute_night";

export const CONFIG_KEYS = {
  perSecond: CONFIG_PER_SECOND_KEY,
  perMinuteDay: CONFIG_PER_MINUTE_DAY_KEY,
  perMinuteNight: CONFIG_PER_MINUTE_NIGHT_KEY,
} as const;

export const DEFAULT_CALLS_PER_SECOND = 20;
export const DEFAULT_DAY_CALLS_PER_MINUTE = 300;
export const DEFAULT_NIGHT_CALLS_PER_MINUTE = 500;

// Here rather than in the Lua script: Lua has no Intl, so it knows nothing of Paris time or DST.
export const minuteConfigKeyAt = (timestampMs: number): string =>
  isParisNightAt(timestampMs) ? CONFIG_PER_MINUTE_NIGHT_KEY : CONFIG_PER_MINUTE_DAY_KEY;

export const secondCounterKeyAt = (timestampMs: number): string =>
  `apip:rate:s:${Math.floor(timestampMs / SECOND_MS)}`;

export const minuteCounterKeyAt = (timestampMs: number): string =>
  `apip:rate:m:${Math.floor(timestampMs / MINUTE_MS)}`;

export type BlockedWindow = "second" | "minute";

export type AppliedLimits = { perSecond: number; perMinute: number; isNight: boolean };

export type RateSlot =
  | ({ allowed: true } & AppliedLimits)
  | ({ allowed: false; blockedBy: BlockedWindow; retryInMs: number } & AppliedLimits);

export interface ApiParticulierRateGate {
  take(): Promise<RateSlot>;
}

export type RateGateOptions = {
  // Used only when the Redis configuration key is absent or unusable.
  fallbackCallsPerSecond?: number;
  fallbackDayCallsPerMinute?: number;
  fallbackNightCallsPerMinute?: number;
  now?: () => number;
  onLimitsChange?: (limits: AppliedLimits) => void;
};

// One round trip, so nothing can slip between reading a ceiling and incrementing its counter.
// Both counters are tested BEFORE either is incremented: a call one window turns away must not
// cost a token on the other.
const TAKE_SLOT_LUA = `
local function limitOf(key, fallback)
  local configured = tonumber(redis.call("GET", key))
  if configured == nil or configured < 1 then return tonumber(fallback) end
  return math.floor(configured)
end

local secondLimit = limitOf(KEYS[3], ARGV[1])
local minuteLimit = limitOf(KEYS[4], ARGV[2])
local secondCount = tonumber(redis.call("GET", KEYS[1]) or "0")
local minuteCount = tonumber(redis.call("GET", KEYS[2]) or "0")

if secondCount >= secondLimit then return {2, secondLimit, minuteLimit} end
if minuteCount >= minuteLimit then return {3, secondLimit, minuteLimit} end

if redis.call("INCR", KEYS[1]) == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[3]) end
if redis.call("INCR", KEYS[2]) == 1 then redis.call("PEXPIRE", KEYS[2], ARGV[4]) end
return {1, secondLimit, minuteLimit}
`;

const TAKE_SLOT_COMMAND = "apipTakeSlot";

type TakeSlotRedis = Redis & {
  [TAKE_SLOT_COMMAND]: (...args: (string | number)[]) => Promise<[number, number, number]>;
};

const defineTakeSlot = (redis: Redis): TakeSlotRedis => {
  const client = redis as TakeSlotRedis;

  if (typeof client[TAKE_SLOT_COMMAND] !== "function") {
    redis.defineCommand(TAKE_SLOT_COMMAND, { numberOfKeys: 4, lua: TAKE_SLOT_LUA });
  }

  return client;
};

const remainingInWindow = (timestampMs: number, windowMs: number): number =>
  (Math.floor(timestampMs / windowMs) + 1) * windowMs - timestampMs;

export function createRedisRateGate(
  redis: Redis,
  options: RateGateOptions = {},
): ApiParticulierRateGate {
  const client = defineTakeSlot(redis);
  const now = options.now ?? Date.now;
  const onLimitsChange = options.onLimitsChange ?? (() => {});

  const fallbackPerSecond =
    options.fallbackCallsPerSecond ??
    positiveNumberFromEnv("API_PARTICULIER_MAX_CALLS_PER_SECOND", DEFAULT_CALLS_PER_SECOND);
  const fallbackPerMinuteDay =
    options.fallbackDayCallsPerMinute ??
    positiveNumberFromEnv("API_PARTICULIER_MAX_CALLS_PER_MINUTE", DEFAULT_DAY_CALLS_PER_MINUTE);
  const fallbackPerMinuteNight =
    options.fallbackNightCallsPerMinute ??
    positiveNumberFromEnv(
      "API_PARTICULIER_MAX_CALLS_PER_MINUTE_NIGHT",
      DEFAULT_NIGHT_CALLS_PER_MINUTE,
    );

  let lastReported: AppliedLimits | null = null;

  // The ceilings are retuned in Redis while the worker runs: unlogged, a change would be
  // invisible from the worker's own output.
  const reportLimits = (limits: AppliedLimits): void => {
    if (
      lastReported?.perSecond === limits.perSecond &&
      lastReported.perMinute === limits.perMinute &&
      lastReported.isNight === limits.isNight
    ) {
      return;
    }

    lastReported = limits;
    onLimitsChange(limits);
  };

  return {
    async take(): Promise<RateSlot> {
      const nowMs = now();
      const isNight = isParisNightAt(nowMs);
      const fallbackPerMinute = isNight ? fallbackPerMinuteNight : fallbackPerMinuteDay;

      const [code, perSecond, perMinute] = await client[TAKE_SLOT_COMMAND](
        secondCounterKeyAt(nowMs),
        minuteCounterKeyAt(nowMs),
        CONFIG_PER_SECOND_KEY,
        minuteConfigKeyAt(nowMs),
        fallbackPerSecond,
        fallbackPerMinute,
        SECOND_KEY_TTL_MS,
        MINUTE_KEY_TTL_MS,
      );

      const limits: AppliedLimits = { perSecond, perMinute, isNight };
      reportLimits(limits);

      if (code === 1) return { allowed: true, ...limits };

      const blockedBy: BlockedWindow = code === 2 ? "second" : "minute";

      return {
        allowed: false,
        blockedBy,
        retryInMs: remainingInWindow(nowMs, blockedBy === "second" ? SECOND_MS : MINUTE_MS),
        ...limits,
      };
    },
  };
}
