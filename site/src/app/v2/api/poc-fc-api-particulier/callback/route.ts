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
  FC_INTERNAL_PAGE_PATH,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  getRedirectUri,
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
  const fcErrorDescription = url.searchParams.get('error_description');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(FC_STATE_COOKIE)?.value;
  const expectedNonce = cookieStore.get(FC_NONCE_COOKIE)?.value;

  // One-time use: clear the transient cookies regardless of outcome.
  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  // Criterion 12: the state is echoed on the error return too, so check it before
  // trusting anything else on the query string — including the error itself.
  if (!state || !expectedState || state !== expectedState) {
    return redirectToPage({ error: 'state' });
  }

  // Criterion 24: FranceConnect returns `error` and `error_description`. The
  // description is operator-facing detail, so it goes to Sentry rather than the page.
  if (fcError) {
    Sentry.withScope((scope) => {
      scope.setLevel(fcError === 'access_denied' ? 'info' : 'warning');
      scope.setTag('fc_error', fcError);
      scope.setExtra('error_description', fcErrorDescription);
      scope.captureMessage(`FranceConnect returned an error: ${fcError}`);
    });

    return redirectToPage({ error: fcError });
  }

  if (!code || !expectedNonce) {
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

    await storePocResult({ identity: pivot, sub: identity.sub, idToken: tokens.idToken });

    return redirectToPage({ status: 'ok' });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect callback failed');
      scope.captureException(e);
    });

    return redirectToPage({ error: 'callback' });
  }
}
