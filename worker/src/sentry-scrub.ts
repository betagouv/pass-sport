import type { Breadcrumb } from "@sentry/node";

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
