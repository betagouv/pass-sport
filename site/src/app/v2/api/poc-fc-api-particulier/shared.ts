import { FranceConnectIdentity } from '@/app/services/france-connect';
import { ApiParticulierResults } from '@/app/services/api-particulier';

export const FC_STATE_COOKIE = 'fc_poc_state';
export const FC_NONCE_COOKIE = 'fc_poc_nonce';
export const FC_ID_TOKEN_COOKIE = 'fc_poc_id_token';
export const FC_RESULT_COOKIE = 'fc_poc_result';

const CALLBACK_PATH = '/v2/api/poc-fc-api-particulier/callback';

export interface PocResult {
  identity: FranceConnectIdentity;
  apiParticulier: ApiParticulierResults;
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

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 3600,
});

export const getRedirectUri = (request: Request): string => {
  const override = process.env.FRANCE_CONNECT_REDIRECT_URI;
  if (override) {
    return override;
  }
  return new URL(CALLBACK_PATH, request.url).toString();
};
