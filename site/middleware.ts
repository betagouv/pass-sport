import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  // style-src 'report-sample' 'nonce-${nonce}' 'self' https://unpkg.com;
  const cspHeader = `
    default-src 'self';
    script-src 'report-sample' 'unsafe-eval' 'nonce-${nonce}' 'self' https://static.axept.io/sdk-slim.js https://stats.beta.gouv.fr/matomo.js;
    style-src 'report-sample' 'unsafe-inline' 'self' https://unpkg.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    connect-src 'self' https://api.axept.io https://client.axept.io https://sports-sgsocialgouv.opendatasoft.com https://stats.beta.gouv.fr https://geo.api.gouv.fr;
    font-src 'self';
    frame-src 'self' https://player.vimeo.com;
    img-src 'self' data: https://a.tile.openstreetmap.org https://axeptio.imgix.net https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://favicons.axept.io https://i.vimeocdn.com https://unpkg.com;
    manifest-src 'self';
    media-src 'self';
    report-uri https://66ab4d8ba05c71ef29160216.endpoint.csper.io/?v=1;
    worker-src 'none';
    upgrade-insecure-requests;
`;
  /**
   ** TODO : add trusted type policies
    require-trusted-types-for 'script';
    trusted-types react-dsfr react-dsfr-asap nextjs nextjs#bundler axeptio;
   */

  // Replace newline characters and spaces
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, ' ').trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', contentSecurityPolicyHeaderValue);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};