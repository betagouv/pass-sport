import * as Sentry from '@sentry/nextjs';

if (!!process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV,
    // Your Sentry configuration for the Browser...
  });
}
