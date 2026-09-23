// Invalid or absent values fall back rather than throw: a typo in a Scalingo variable must not
// take the worker down.
export const positiveNumberFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Blank must not read as 0: Number("") is 0.
export const nonNegativeNumberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;

  console.warn(
    `[pass-sport-worker] ${name}="${raw}" is not a non-negative number, using ${fallback}`,
  );
  return fallback;
};

export const fcRelanceAllowlistOnly = (): boolean =>
  process.env.FC_RELANCE_ALLOWLIST_ONLY === "yes";

export const fcRelanceCooldownDays = (): number =>
  nonNegativeNumberFromEnv("FC_RELANCE_COOLDOWN_DAYS", 2);
