import { FranceConnectIdentity } from '@/app/services/france-connect';
import { ApiParticulierResults } from '@/app/services/api-particulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

export const FC_STATE_COOKIE = 'fc_poc_state';
export const FC_NONCE_COOKIE = 'fc_poc_nonce';
export const FC_ID_TOKEN_COOKIE = 'fc_poc_id_token';
export const FC_LOGOUT_STATE_COOKIE = 'fc_poc_logout_state';

const CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/callback';
const LOGOUT_CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/logout/callback';

// Reversed flow: FranceConnect authenticates first, so the callback stores an
// identity-only session. The aides + commune form comes next; confirming it calls
// API Particulier and augments the session (apiParticulier / residenceInsee / aides).
export interface PocResult {
  identity: FranceConnectIdentity;
  // FranceConnect access token, kept (Redis only, short TTL) to call API Particulier
  // in FranceConnect-token mode instead of the static API key. FC tokens are
  // short-lived: the collect step must happen quickly after login.
  accessToken?: string;
  // Set only once the post-login aides + commune form is confirmed.
  apiParticulier?: ApiParticulierResults;
  // Commune de résidence (INSEE) collected after login, used by the LCA search.
  residenceInsee?: string;
  // Aides bénéficiées selected in the post-login form; kept to preselect the no-FC
  // AllowanceStep and to prefill the form on re-edit.
  aides?: ALLOWANCE[];
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
