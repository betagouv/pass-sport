import * as Sentry from '@sentry/nextjs';

if (!!process.env.SENTRY_DSN) {
  // Sentry configuration for browser
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV,
    // FranceConnect identities transit this app; never let Sentry attach them.
    sendDefaultPii: false,
  });

  console.info('[pass-sport-app] Sentry initialized for ' + process.env.ENV);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
