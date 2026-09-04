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
} from '@/app/api/france-connect/shared';
import { storePocResult } from '@/app/api/france-connect/session';
import { toPivotIdentity } from '@/app/api/france-connect/pivot';

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

  console.log('[fc-callback] received', {
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasExpectedState: Boolean(expectedState),
    hasExpectedNonce: Boolean(expectedNonce),
    fcError,
    fcErrorDescription,
  });

  // One-time use: clear the transient cookies regardless of outcome.
  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  // Criterion 12: the state is echoed on the error return too, so check it before
  // trusting anything else on the query string — including the error itself.
  if (!state || !expectedState || state !== expectedState) {
    console.log('[fc-callback] state mismatch', {
      hasState: Boolean(state),
      hasExpectedState: Boolean(expectedState),
      matches: state === expectedState,
    });

    return redirectToPage({ error: 'state' });
  }

  // Criterion 24: FranceConnect returns `error` and `error_description`. The
  // description is operator-facing detail, so it goes to Sentry rather than the page.
  if (fcError) {
    console.log('[fc-callback] FranceConnect error', { fcError, fcErrorDescription });

    Sentry.withScope((scope) => {
      scope.setLevel(fcError === 'access_denied' ? 'info' : 'warning');
      scope.setTag('fc_error', fcError);
      scope.setExtra('error_description', fcErrorDescription);
      scope.captureMessage(`FranceConnect returned an error: ${fcError}`);
    });

    return redirectToPage({ error: fcError });
  }

  if (!code || !expectedNonce) {
    console.log('[fc-callback] missing code or nonce', {
      hasCode: Boolean(code),
      hasExpectedNonce: Boolean(expectedNonce),
    });

    return redirectToPage({ error: 'state' });
  }

  try {
    const config = getFranceConnectConfig();
    const redirectUri = getRedirectUri();

    console.log('[fc-callback] exchanging code for tokens', { redirectUri });

    const tokens = await exchangeCodeForTokens({
      config,
      code,
      redirectUri,
    });

    console.log('[fc-callback] tokens received', {
      hasAccessToken: Boolean(tokens.accessToken),
      hasIdToken: Boolean(tokens.idToken),
    });

    // Verify the id_token ES256 signature (issuer, audience, nonce) before trusting it.
    await verifyIdToken({ config, idToken: tokens.idToken, nonce: expectedNonce });

    console.log('[fc-callback] id_token verified');

    const identity = await fetchUserInfo({ config, accessToken: tokens.accessToken });
    const pivot = toPivotIdentity(identity);

    console.log('[fc-callback] userinfo fetched', {
      hasSub: Boolean(identity.sub),
      hasPivot: Boolean(pivot),
      claims: Object.keys(identity),
    });

    if (!pivot) {
      console.log('[fc-callback] pivot identity incomplete');

      return redirectToPage({ error: 'identity' });
    }

    if (!identity.sub || identity.sub.includes(':')) {
      console.log('[fc-callback] invalid sub');

      return redirectToPage({ error: 'identity' });
    }

    await storePocResult({ identity: pivot, sub: identity.sub, idToken: tokens.idToken });

    console.log('[fc-callback] result stored, redirecting with status ok');

    return redirectToPage({ status: 'ok' });
  } catch (e) {
    console.error('[fc-callback] failed', e);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect callback failed');
      scope.captureException(e);
    });

    return redirectToPage({ error: 'callback' });
  }
}
