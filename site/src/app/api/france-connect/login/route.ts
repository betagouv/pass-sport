import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { buildAuthorizeUrl, getFranceConnectConfig } from '@/app/services/france-connect';
import {
  FC_INTERNAL_PAGE_PATH,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  generateOidcSecret,
  getRedirectUri,
  transientCookieOptions,
} from '@/app/api/france-connect/shared';

export async function GET(request: Request): Promise<Response> {
  try {
    const config = getFranceConnectConfig();
    const state = generateOidcSecret();
    const nonce = generateOidcSecret();

    const authorizeUrl = buildAuthorizeUrl({
      config,
      redirectUri: getRedirectUri(),
      state,
      nonce,
    });

    const cookieStore = await cookies();
    cookieStore.set(FC_STATE_COOKIE, state, transientCookieOptions());
    cookieStore.set(FC_NONCE_COOKIE, nonce, transientCookieOptions());

    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC login failed');
      scope.captureException(e);
    });
    return NextResponse.redirect(new URL(`${FC_INTERNAL_PAGE_PATH}?error=login`, request.url));
  }
}
