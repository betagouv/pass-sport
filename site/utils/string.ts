export function escapeSingleQuotes(value: string) {
  return value.replaceAll(`'`, `\\'`);
}

export function unescapeSingleQuotes(value: string) {
  return value.replaceAll(`\\'`, `'`);
}

export function fromBase64ToString(base64: string): string {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

// Business rule
export function matchExactDrajes(input: string): boolean {
  const regex = /\bDRAJES\b/i;

  return regex.test(input);
}

// Business rule
export function matchExactLsm(input: string): boolean {
  const regex = /\bLSM(?:USC|ACTIVE|COSMOS)2025\b/i;

  return regex.test(input);
}
