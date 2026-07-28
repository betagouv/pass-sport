import type { PivotIdentity } from '@/app/services/queue';

export const FC_STATE_COOKIE = 'fc_poc_state';
export const FC_NONCE_COOKIE = 'fc_poc_nonce';
export const FC_ID_TOKEN_COOKIE = 'fc_poc_id_token';
export const FC_LOGOUT_STATE_COOKIE = 'fc_poc_logout_state';

const CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/callback';
const LOGOUT_CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/logout/callback';

// Reversed flow: FranceConnect authenticates first, so the callback stores an
// identity-only session. The aides + commune form comes next; confirming it enqueues
// an eligibility job (the worker owns the API Particulier + LCA work), so the session
// holds nothing beyond the FranceConnect identity.
//
// Lives in Redis under a 10-minute TTL (session.ts), keyed by an httpOnly session id
// cookie — the browser never receives the identity itself.
export interface PocResult {
  identity: PivotIdentity;
  // FranceConnect pairwise pseudonym. The site needs it to recognise a returning user
  // across sessions — it becomes the BullMQ job id, so a reconnecting user cannot
  // enqueue a second job.
  sub: string;
}

const isProd = process.env.NODE_ENV === 'production';

// Short-lived cookies holding the OIDC state/nonce during the redirect round-trip.
// sameSite 'lax' so they survive the top-level GET redirect back from FranceConnect.
export const transientCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 600,
});

// Session id cookie: 10 minutes, aligned with the Redis TTL of the personal
// data it points to (SESSION_TTL_SECONDS in session.ts).
export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 600,
});

export const getRedirectUri = (request: Request): string => {
  const override = process.env.FRANCE_CONNECT_REDIRECT_URI;
  if (override) {
    return override;
  }
  return new URL(CALLBACK_PATH, request.url).toString();
};

// Must exactly match the post-logout redirect URI registered with FranceConnect.
export const getPostLogoutRedirectUri = (request: Request): string => {
  const override = process.env.FRANCE_CONNECT_POST_LOGOUT_REDIRECT_URI;
  if (override) {
    return override;
  }
  return new URL(LOGOUT_CALLBACK_PATH, request.url).toString();
};
