import 'server-only';

// The dashboard is only reachable at /tableau-de-bord/<DASHBOARD_URL_KEY>: whoever holds the URL
// can read it, nobody else. The key must stay a server-side variable: a NEXT_PUBLIC_ one would be
// inlined into the public JS bundles.
export const DASHBOARD_PATH = '/tableau-de-bord';

const KEY_FORMAT = /^[A-Za-z0-9_-]{32,}$/;

let warnedAboutKey = false;

const readKey = (): string | null => {
  const key = process.env.DASHBOARD_URL_KEY?.trim();
  if (key && KEY_FORMAT.test(key)) return key;

  if (key && !warnedAboutKey) {
    warnedAboutKey = true;
    console.warn(
      '[pass-sport] DASHBOARD_URL_KEY must be at least 32 characters among [A-Za-z0-9_-], the dashboard stays closed',
    );
  }
  return null;
};

// Constant time, in plain TS so that it runs in the proxy as well as in the page.
const sameString = (a: string, b: string): boolean => {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export const isDashboardKey = (candidate: string): boolean => {
  const key = readKey();
  return key !== null && sameString(candidate, key);
};
