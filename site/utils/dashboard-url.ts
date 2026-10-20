// The dashboard URL carries its access key (src/app/services/dashboard-access.ts): this keeps it
// out of whatever reports URLs to a third party (Matomo, Sentry).
export const DASHBOARD_URL_PATTERN = /^\/tableau-de-bord(\/|$)/;

// Restricted to the key's alphabet, so that it is safe to apply to serialized JSON.
export const maskDashboardKey = (text: string): string =>
  text.replace(/\/tableau-de-bord\/[A-Za-z0-9_-]+/g, '/tableau-de-bord/***');

// For JSON payloads such as Sentry events, where the URL may sit in many fields.
export const maskDashboardKeyIn = <T>(payload: T): T => {
  const json = JSON.stringify(payload);
  return json?.includes('/tableau-de-bord/') ? JSON.parse(maskDashboardKey(json)) : payload;
};
