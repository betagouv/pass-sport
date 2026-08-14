import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { buildLogoutUrl, getFranceConnectConfig } from '@/app/services/france-connect';
import {
  BASE_DOMAIN,
  FC_INTERNAL_PAGE_PATH,
  FC_LOGOUT_STATE_COOKIE,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  generateOidcSecret,
  getPostLogoutRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';
import { deletePocResult, loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';

export async function GET(): Promise<Response> {
  // Read the id_token before dropping the session: criterion 14 needs it as
  // `id_token_hint` so FranceConnect closes its own session too.
  const idToken = (await loadPocResult())?.idToken;

  // Removes the Redis session entry and the session id cookie.
  await deletePocResult();

  const cookieStore = await cookies();

  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  if (idToken) {
    try {
      const config = getFranceConnectConfig();
      const state = generateOidcSecret();

      cookieStore.set(FC_LOGOUT_STATE_COOKIE, state, transientCookieOptions());

      const url = buildLogoutUrl({
        config,
        idToken,
        postLogoutRedirectUri: getPostLogoutRedirectUri(),
        state,
      });

      return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      // FC config unavailable: fall back to the local-only logout.
      Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.captureMessage('FranceConnect POC logout: session/end redirect failed');
        scope.captureException(e);
      });
    }
  }

  return NextResponse.redirect(new URL(`${FC_INTERNAL_PAGE_PATH}?status=loggedout`, BASE_DOMAIN));
}
