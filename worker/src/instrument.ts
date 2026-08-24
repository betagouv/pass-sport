// Sentry init, imported first in index.ts so instrumentation is set up before any
// other module loads. Only initializes when SENTRY_DSN and ENV are both set, so
// local/dev (neither set) is a no-op and captures elsewhere silently drop.
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN && process.env.ENV) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.ENV,
    tracesSampleRate: 0.03,
    attachStacktrace: true,
    // Identities flow through this process; never let Sentry attach them.
    // Captures must stay PII-free at the call site too (see lca/process.ts).
    sendDefaultPii: false,
  });
  console.info("[pass-sport-worker] Sentry initialized for " + process.env.ENV);
}
