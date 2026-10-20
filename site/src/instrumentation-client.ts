import * as Sentry from '@sentry/nextjs';
import { maskDashboardKeyIn } from '@/utils/dashboard-url';

if (!!process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // Sentry configuration for browser
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.ENV,
    // FranceConnect identities transit this app; never let Sentry attach them.
    sendDefaultPii: false,
    beforeSend: maskDashboardKeyIn,
    beforeSendTransaction: maskDashboardKeyIn,
  });

  console.info('[pass-sport-app] Sentry initialized for ' + process.env.ENV);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
