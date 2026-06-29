import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import {
  exchangeCodeForTokens,
  fetchUserInfo,
  getFranceConnectConfig,
  verifyIdToken,
} from '@/app/services/france-connect';
import { callApiParticulier } from '@/app/services/api-particulier';
import { AuditContext } from '@/app/services/audit';
import { getClientIp } from '@/utils/client-ip';
import {
  FC_ID_TOKEN_COOKIE,
  FC_NONCE_COOKIE,
  FC_RESULT_COOKIE,
  FC_STATE_COOKIE,
  PocResult,
  getRedirectUri,
  sessionCookieOptions,
  transientCookieOptions,
} from '@/app/v2/api/poc-fc-api-particulier/shared';

const PAGE_PATH = '/v2/poc-fc-api-particulier';
// Browser cookies cap at ~4KB; keep the stored result under that.
const MAX_RESULT_COOKIE_SIZE = 3800;

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
      recipientSiret: process.env.API_PARTICULIER_RECIPIENT_SIRET ?? null,
    };

    // FranceConnect-only test mode: skip API Particulier (no token/SIRET/Redis needed).
    const skipApiParticulier = process.env.POC_SKIP_API_PARTICULIER === 'true';
    const apiParticulier = skipApiParticulier ? [] : await callApiParticulier(identity, audit);

    const result: PocResult = { identity, apiParticulier };
    const serialized = JSON.stringify(result);

    const response = redirectToPage(request, '?status=ok');
    response.cookies.set(FC_ID_TOKEN_COOKIE, tokens.idToken, transientCookieOptions());

    if (serialized.length <= MAX_RESULT_COOKIE_SIZE) {
      response.cookies.set(FC_RESULT_COOKIE, serialized, sessionCookieOptions());
    } else {
      // Result too large for a cookie — keep identity + status, drop verbose payloads.
      const trimmed: PocResult = {
        identity,
        apiParticulier: apiParticulier.map((r) => ({
          ...r,
          data: null,
          error: r.error ?? 'Payload omitted (POC cookie size limit)',
        })),
      };
      response.cookies.set(FC_RESULT_COOKIE, JSON.stringify(trimmed), sessionCookieOptions());
    }

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
