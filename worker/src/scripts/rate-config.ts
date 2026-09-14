// Reads and sets the API Particulier ceilings the worker enforces. They live in Redis rather
// than in the environment so they can be retuned while the worker runs: the gate re-reads them
// on every call, so a change here applies to the very next API call, with no redeploy.
//
//   pnpm apip:rate
//   pnpm apip:rate --per-second 10
//   pnpm apip:rate --per-minute-day 250 --per-minute-night 450
//   pnpm apip:rate --reset

import "../load-env";
import { Redis } from "ioredis";
import {
  CONFIG_KEYS,
  DEFAULT_CALLS_PER_SECOND,
  DEFAULT_DAY_CALLS_PER_MINUTE,
  DEFAULT_NIGHT_CALLS_PER_MINUTE,
  minuteConfigKeyAt,
} from "../eligibility/rate-gate";
import { positiveNumberFromEnv } from "../env";

// FC_CODE_EMAILS_REDIS_URL is the tunnel-rewritten URL the processing machine uses.
const REDIS_URL =
  process.env.FC_CODE_EMAILS_REDIS_URL ?? process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

type Setting = {
  flag: string;
  key: string;
  label: string;
  fallback: () => number;
};

const SETTINGS: Setting[] = [
  {
    flag: "--per-second",
    key: CONFIG_KEYS.perSecond,
    label: "appels/seconde",
    fallback: () =>
      positiveNumberFromEnv("API_PARTICULIER_MAX_CALLS_PER_SECOND", DEFAULT_CALLS_PER_SECOND),
  },
  {
    flag: "--per-minute-day",
    key: CONFIG_KEYS.perMinuteDay,
    label: "appels/minute (jour, 8h-21h Paris)",
    fallback: () =>
      positiveNumberFromEnv("API_PARTICULIER_MAX_CALLS_PER_MINUTE", DEFAULT_DAY_CALLS_PER_MINUTE),
  },
  {
    flag: "--per-minute-night",
    key: CONFIG_KEYS.perMinuteNight,
    label: "appels/minute (nuit, 21h-8h Paris)",
    fallback: () =>
      positiveNumberFromEnv(
        "API_PARTICULIER_MAX_CALLS_PER_MINUTE_NIGHT",
        DEFAULT_NIGHT_CALLS_PER_MINUTE,
      ),
  },
];

const readValue = (argv: string[], flag: string): number | undefined => {
  const index = argv.indexOf(flag);

  if (index === -1) return undefined;

  const raw = argv[index + 1];
  const parsed = Number(raw);

  // Refused rather than clamped: the gate falls back on an unusable value, so accepting one
  // here would leave the operator believing a ceiling was applied.
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} expects an integer >= 1, got "${raw}"`);
  }

  return parsed;
};

const describe = (stored: string | null, fallback: number): string =>
  stored === null ? `${fallback} (repli, aucune clé posée)` : `${stored}`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const reset = argv.includes("--reset");
  const updates = SETTINGS.map((setting) => ({
    setting,
    value: readValue(argv, setting.flag),
  })).filter((update): update is { setting: Setting; value: number } => update.value !== undefined);

  if (reset && updates.length > 0) {
    throw new Error("--reset cannot be combined with an explicit value");
  }

  const redis = new Redis(REDIS_URL);

  try {
    if (reset) {
      const removed = await redis.del(...SETTINGS.map((setting) => setting.key));
      console.log(`[apip:rate] ${removed} clé(s) supprimée(s), retour aux replis`);
    }

    for (const { setting, value } of updates) {
      const previous = await redis.get(setting.key);
      // No TTL, unlike the counters: a ceiling outlives the minute it was set in.
      await redis.set(setting.key, String(value));
      console.log(
        `[apip:rate] ${setting.label}: ${describe(previous, setting.fallback())} -> ${value}`,
      );
    }

    const nowMs = Date.now();
    const activeMinuteKey = minuteConfigKeyAt(nowMs);

    console.log("[apip:rate] plafonds en vigueur:");

    for (const setting of SETTINGS) {
      const stored = await redis.get(setting.key);
      const active = setting.key === CONFIG_KEYS.perSecond || setting.key === activeMinuteKey;
      console.log(
        `  ${active ? "*" : " "} ${setting.label}: ${describe(stored, setting.fallback())}`,
      );
    }

    console.log("  (* = appliqué maintenant)");
  } finally {
    await redis.quit();
  }
}

main().catch((err: unknown) => {
  console.error("[apip:rate]", err instanceof Error ? err.message : err);
  process.exit(1);
});
