// Logout: always destroys the local session (Redis entry + cookies). When a
// FranceConnect id_token is present (mode 2), the user is then sent to the
// FranceConnect session/end endpoint so the FC session is closed too — critical
// on shared computers, otherwise the next user could reconnect without a
// password. FranceConnect redirects back to /logout/callback (state-checked).
//
// Mode 1 (form) or missing/expired id_token: local-only logout.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { buildLogoutUrl, getFranceConnectConfig } from '@/app/services/france-connect';
import {
  FC_ID_TOKEN_COOKIE,
  FC_LOGOUT_STATE_COOKIE,
  FC_NONCE_COOKIE,
  FC_STATE_COOKIE,
  getPostLogoutRedirectUri,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';
import { deletePocResult } from '@/app/v2/api/poc-fc-api-particulier/session';

const PAGE_PATH = '/v2/poc-fc-api-particulier';

export async function GET(request: Request): Promise<Response> {
  // Removes the Redis session entry and the session id cookie.
  await deletePocResult();

  const cookieStore = await cookies();
  const idToken = cookieStore.get(FC_ID_TOKEN_COOKIE)?.value;

  cookieStore.delete(FC_ID_TOKEN_COOKIE);
  cookieStore.delete(FC_STATE_COOKIE);
  cookieStore.delete(FC_NONCE_COOKIE);

  if (idToken) {
    try {
      const config = getFranceConnectConfig();
      const state = crypto.randomUUID();

      cookieStore.set(FC_LOGOUT_STATE_COOKIE, state, transientCookieOptions());

      const url = buildLogoutUrl({
        config,
        idToken,
        postLogoutRedirectUri: getPostLogoutRedirectUri(request),
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

  return NextResponse.redirect(new URL(`${PAGE_PATH}?status=loggedout`, request.url));
}
