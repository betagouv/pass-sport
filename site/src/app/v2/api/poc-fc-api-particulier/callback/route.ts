import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  getFranceConnectConfig,
  verifyIdToken,
} from '@/app/services/france-connect';
import { callApiParticulierFranceConnect } from '@/app/services/api-particulier';
import { AuditContext } from '@/app/services/audit';
import { getClientIp } from '@/utils/client-ip';
import {
  FC_ID_TOKEN_COOKIE,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  PocResult,
  getRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';
import { storePocResult } from '@/app/v2/api/poc-fc-api-particulier/session';

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

    const audit: AuditContext = {
      requestId: crypto.randomUUID(),
      franceConnected: true,
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    };

    // Mode "FranceConnecté" (mode 2): the FC access token authenticates the API
    // Particulier calls directly — no identity params sent. Must happen here, while
    // the token is fresh. `identity` (pivot from /userinfo) is still kept in the
    // result for the downstream LCA calls (fetchEligible / fetchCode).
    // Mode 1 (static token + identity params) lives in the /identite route, for
    // users who cannot use FranceConnect.
    const apiParticulier = await callApiParticulierFranceConnect(tokens.accessToken, audit);

    const result: PocResult = { identity, apiParticulier };

    // Personal data goes to the Redis session store; the browser only receives
    // the random session id (httpOnly cookie).
    await storePocResult(result);

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
