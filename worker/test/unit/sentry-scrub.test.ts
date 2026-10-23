import { describe, expect, it } from "vitest";
import { isDnPrefillRequest, scrubHttpBreadcrumb } from "../../src/sentry-scrub";

describe("scrubHttpBreadcrumb", () => {
  it("drops the query string and fragment of an outgoing call", () => {
    const breadcrumb = {
      category: "http",
      type: "http",
      data: {
        url: "https://particulier.api.gouv.fr/api/v3/dss/quotient_familial/identite",
        "http.method": "GET",
        "http.query": "?nomNaissance=OSTRENYA&prenoms[]=Velmorak",
        "http.fragment": "#x",
        status_code: 200,
      },
    };

    expect(scrubHttpBreadcrumb(breadcrumb)).toEqual({
      category: "http",
      type: "http",
      data: {
        url: "https://particulier.api.gouv.fr/api/v3/dss/quotient_familial/identite",
        "http.method": "GET",
        status_code: 200,
      },
    });
  });

  it("leaves other breadcrumbs alone", () => {
    const breadcrumb = { category: "console", message: "x", data: { "http.query": "?kept" } };

    expect(scrubHttpBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});

describe("isDnPrefillRequest", () => {
  it.each([
    ["https://demarche.numerique.gouv.fr/api/public/v1/demarches/159278/dossiers?prefill_token=t", true],
    ["http://127.0.0.1:4000/api/public/v1/demarches/1/dossiers", true],
    ["https://particulier.api.gouv.fr/api/v3/dss/quotient_familial/identite?x=1", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isDnPrefillRequest(url)).toBe(expected);
  });
});
