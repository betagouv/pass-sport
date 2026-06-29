import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/nextjs';
import { buildAuthorizeUrl, getFranceConnectConfig } from '@/app/services/france-connect';
import {
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  getRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';

export async function GET(request: Request): Promise<Response> {
  try {
    const config = getFranceConnectConfig();
    const state = randomUUID();
    const nonce = randomUUID();

    const authorizeUrl = buildAuthorizeUrl({
      config,
      redirectUri: getRedirectUri(request),
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
    return NextResponse.redirect(new URL('/v2/poc-fc-api-particulier?error=login', request.url));
  }
}
