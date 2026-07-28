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
  FC_ID_TOKEN_COOKIE,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  getRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';
import { storePocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { toPivotIdentity } from '@/app/v2/api/poc-fc-api-particulier/pivot';

const PAGE_PATH = '/v2/poc-fc-api-particulier';

const redirectToPage = (request: Request, query = ''): NextResponse =>
  NextResponse.redirect(new URL(`${PAGE_PATH}${query}`, request.url));

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
    return redirectToPage(request, `?error=${encodeURIComponent(fcError)}`);
  }

  if (!code || !state || !expectedState || state !== expectedState || !expectedNonce) {
    return redirectToPage(request, '?error=state');
  }

  try {
    const config = getFranceConnectConfig();
    const tokens = await exchangeCodeForTokens({
      config,
      code,
      redirectUri: getRedirectUri(request),
    });

    // Verify the id_token ES256 signature (issuer, audience, nonce) before trusting it.
    await verifyIdToken({ config, idToken: tokens.idToken, nonce: expectedNonce });

    const identity = await fetchUserInfo({ config, accessToken: tokens.accessToken });

    // Reversed flow: FranceConnect only authenticates the user here. API Particulier
    // is NOT called yet — it runs later, once the user confirms the aides + commune
    // form (see the /collect route), in "identité pivot" mode using this identity.
    // The FC access token is not kept: only the pivot identity is needed.
    const pivot = toPivotIdentity(identity);
    if (!pivot) {
      return redirectToPage(request, '?error=identity');
    }
    // Used as the BullMQ job id, which must not contain ':'. FranceConnect subs are
    // hex-ish, but reject rather than silently mangle the dedup key.
    if (!identity.sub || identity.sub.includes(':')) {
      return redirectToPage(request, '?error=identity');
    }

    // The browser only receives the random session id (httpOnly cookie); the identity
    // itself stays server-side in Redis under the session's 10-minute TTL.
    await storePocResult({ identity: pivot, sub: identity.sub });

    const response = redirectToPage(request, '?status=ok');
    response.cookies.set(FC_ID_TOKEN_COOKIE, tokens.idToken, transientCookieOptions());

    return response;
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC callback failed');
      scope.captureException(e);
    });
    return redirectToPage(request, '?error=callback');
  }
}
