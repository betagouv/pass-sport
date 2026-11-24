import * as Sentry from '@sentry/nextjs';

if (!!process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // Sentry configuration for browser
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_ENV,
    // FranceConnect identities transit this app; never let Sentry attach them.
    sendDefaultPii: false,
  });

  console.info('[pass-sport-app] Sentry initialized for ' + process.env.NEXT_PUBLIC_ENV);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
