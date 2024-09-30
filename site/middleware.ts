import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `'self' 'unsafe-inline' 'unsafe-eval'`;

  const cspHeader = `
    default-src 'self';
    script-src 'report-sample' ${scriptSrc} https://client.crisp.chat/ https://stats.beta.gouv.fr/matomo.js https://tarteaucitron.io/ https://cdn.tarteaucitron.io/;
    style-src 'report-sample' 'unsafe-inline' 'self' https://unpkg.com https://client.crisp.chat/ https://cdn.tarteaucitron.io/;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    connect-src 'self' https://client.crisp.chat/ wss://client.relay.crisp.chat/ https://sports-sgsocialgouv.opendatasoft.com https://stats.beta.gouv.fr https://geo.api.gouv.fr;
    font-src 'self' https://client.crisp.chat/;
    frame-src 'self' https://player.vimeo.com https://pass-sport.crisp.help/;
    img-src 'self' data: https://image.crisp.chat/ https://client.crisp.chat/ https://storage.crisp.chat/ https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://i.vimeocdn.com https://unpkg.com https://tarteaucitron.io;
    manifest-src 'self';
    media-src 'self';
    report-uri https://66ab4d8ba05c71ef29160216.endpoint.csper.io/?v=1;
    worker-src 'none';
    upgrade-insecure-requests;
`;
  /**
   ** TODO : add trusted type policies
    require-trusted-types-for 'script';
    trusted-types react-dsfr react-dsfr-asap nextjs nextjs#bundler;
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
