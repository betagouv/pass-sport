import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  getFranceConnectConfig,
  verifyIdToken,
} from '@/app/services/france-connect';
import {
  BASE_DOMAIN,
  FC_ID_TOKEN_COOKIE,
  FC_INTERNAL_PAGE_PATH,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  getRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';
import { storePocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { toPivotIdentity } from '@/app/v2/api/poc-fc-api-particulier/pivot';

const redirectToPage = (params: Record<string, string> = {}): NextResponse => {
  const url = new URL(FC_INTERNAL_PAGE_PATH, BASE_DOMAIN);

  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  return NextResponse.redirect(url);
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const fcError = url.searchParams.get('error');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FC_STATE_COOKIE)?.value;
  const expectedNonce = cookieStore.get(FC_NONCE_COOKIE)?.value;

  // One-time use: clear the transient cookies regardless of outcome.
  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  if (fcError) {
    return redirectToPage({ error: fcError });
  }

  if (!code || !state || !expectedState || state !== expectedState || !expectedNonce) {
    return redirectToPage({ error: 'state' });
  }

  try {
    const config = getFranceConnectConfig();
    const tokens = await exchangeCodeForTokens({
      config,
      code,
      redirectUri: getRedirectUri(),
    });

    // Verify the id_token ES256 signature (issuer, audience, nonce) before trusting it.
    await verifyIdToken({ config, idToken: tokens.idToken, nonce: expectedNonce });

    const identity = await fetchUserInfo({ config, accessToken: tokens.accessToken });
    const pivot = toPivotIdentity(identity);

    if (!pivot) {
      return redirectToPage({ error: 'identity' });
    }

    if (!identity.sub || identity.sub.includes(':')) {
      return redirectToPage({ error: 'identity' });
    }

    await storePocResult({ identity: pivot, sub: identity.sub });

    const response = redirectToPage({ status: 'ok' });

    response.cookies.set(FC_ID_TOKEN_COOKIE, tokens.idToken, transientCookieOptions());

    return response;
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC callback failed');
      scope.captureException(e);
    });

    return redirectToPage({ error: 'callback' });
  }
}
