// The dashboard URL carries its access key (src/app/services/dashboard-access.ts): this keeps it
// out of whatever reports URLs to a third party (Matomo).
export const DASHBOARD_URL_PATTERN = /^\/tableau-de-bord(\/|$)/;

// Restricted to the key's alphabet, so that the query string and fragment are kept.
export const maskDashboardKey = (text: string): string =>
  text.replace(/\/tableau-de-bord\/[A-Za-z0-9_-]+/g, '/tableau-de-bord/***');
