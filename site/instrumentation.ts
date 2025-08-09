import * as Sentry from '@sentry/nextjs';

export function register() {
  if (!!process.env.SENTRY_DSN && !!process.env.ENV) {
    Sentry.init({
      environment: process.env.ENV,
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.03,
      attachStacktrace: true,
    });
    console.info('Sentry initialized for ' + process.env.NEXT_RUNTIME);
  }
}
