export const PARIS_NIGHT_START_HOUR = 21;
export const PARIS_NIGHT_END_HOUR = 8;

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
