// Invalid or absent values fall back rather than throw: a typo in a Scalingo variable must not
// take the worker down.
export const positiveNumberFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
