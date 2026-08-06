import type { PivotIdentity } from '@/app/services/queue';

export const BASE_DOMAIN = process.env.BASE_DOMAIN;
export const FC_INTERNAL_PAGE_PATH = '/v2/poc-fc-api-particulier';

export const FC_STATE_COOKIE = 'fc_poc_state';
export const FC_NONCE_COOKIE = 'fc_poc_nonce';
export const FC_ID_TOKEN_COOKIE = 'fc_poc_id_token';
export const FC_LOGOUT_STATE_COOKIE = 'fc_poc_logout_state';

const CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/callback';
const LOGOUT_CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/logout/callback';

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

export const getRedirectUri = (): string => {
  const override = process.env.FRANCE_CONNECT_REDIRECT_URI;

  if (override) {
    return override;
  }

  return new URL(CALLBACK_PATH, BASE_DOMAIN).toString();
};

// Must exactly match the post-logout redirect URI registered with FranceConnect.
export const getPostLogoutRedirectUri = (): string => {
  const override = process.env.FRANCE_CONNECT_POST_LOGOUT_REDIRECT_URI;

  if (override) {
    return override;
  }

  return new URL(LOGOUT_CALLBACK_PATH, BASE_DOMAIN).toString();
};
