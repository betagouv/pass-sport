import type { Breadcrumb, ErrorEvent } from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";

// The fetch instrumentation records every outgoing query string on its breadcrumb,
// sendDefaultPii or not: the identité pivot of each API Particulier call, among others.
export const scrubHttpBreadcrumb = (breadcrumb: Breadcrumb): Breadcrumb => {
  if (breadcrumb.category !== "http" || !breadcrumb.data) return breadcrumb;

  const { "http.query": _query, "http.fragment": _fragment, ...data } = breadcrumb.data;
  return { ...breadcrumb, data };
};

// Démarche Numérique prefill calls, whose URLs carry the dossier's bearer token: no span at all.
export const isDnPrefillRequest = (url: string): boolean =>
  URL.canParse(url) && new URL(url).pathname.startsWith("/api/public/v1/demarches/");

// drizzle lists a failed query's bound values in its message: identities, and a DN dossier's
// bearer prefill token. Rewritten in place, stack included, before BullMQ keeps both as the
// job's failedReason and stacktrace. Its cause, the driver error, has no values in its message.
export const withoutQueryValues = (error: unknown): unknown => {
  if (!(error instanceof DrizzleQueryError)) return error;

  const message = `Failed query: ${error.query}`;
  // A function, or the query's $1, $2… placeholders would read as replacement patterns.
  error.stack = error.stack?.replace(error.message, () => message);
  error.message = message;
  error.params = [];
  return error;
};

const QUERY_VALUES = /\nparams: [\s\S]*/;
const PREFILL_TOKEN = /prefill_token=[^&\s"']+/g;

const redact = (text: string): string =>
  text
    .replace(QUERY_VALUES, "\nparams: [redacted]")
    .replace(PREFILL_TOKEN, "prefill_token=[redacted]");

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

const redactDeep = (value: unknown): unknown => {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redactDeep(inner)]));
  }
  return value;
};

// Last line of defence, for a capture that still carries them: exception, message, extra and
// breadcrumbs, console ones included (they repeat what was logged).
export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redact(exception.value);
  }
  if (event.message) event.message = redact(event.message);
  if (event.extra) event.extra = redactDeep(event.extra) as ErrorEvent["extra"];
  for (const breadcrumb of event.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = redact(breadcrumb.message);
    if (breadcrumb.data) breadcrumb.data = redactDeep(breadcrumb.data) as Breadcrumb["data"];
  }
  return event;
};
