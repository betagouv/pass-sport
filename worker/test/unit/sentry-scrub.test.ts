import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/node";
import { DrizzleQueryError } from "drizzle-orm";
import {
  isDnPrefillRequest,
  scrubEvent,
  scrubHttpBreadcrumb,
  withoutQueryValues,
} from "../../src/sentry-scrub";

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

const DOSSIER_URL = "https://demarche.numerique.gouv.fr/commencer/x?prefill_token=SECRET";
const QUERY = 'insert into "fc_dn_dossiers" ("sub", "dossier_url") values ($1, $2)';
const failedInsert = () =>
  new DrizzleQueryError(
    QUERY,
    ["sub-1", DOSSIER_URL],
    new Error("Connection terminated unexpectedly"),
  );

describe("withoutQueryValues", () => {
  it("strips a failed query's values from its message and stack, keeping its cause", () => {
    const error = failedInsert();
    const cause = error.cause;

    const scrubbed = withoutQueryValues(error);

    expect(scrubbed).toBe(error);
    expect(error.message).toBe(`Failed query: ${QUERY}`);
    expect(error.stack).toContain(QUERY);
    expect(error.stack).not.toContain("SECRET");
    expect(error.stack).not.toContain("sub-1");
    expect(error.params).toEqual([]);
    expect(error.cause).toBe(cause);
  });

  it("leaves other errors alone", () => {
    const error = new Error("prefill_token=kept");

    expect(withoutQueryValues(error)).toBe(error);
    expect(error.message).toBe("prefill_token=kept");
  });
});

describe("scrubEvent", () => {
  const leaked = failedInsert().message;

  it("redacts query values and prefill tokens wherever an event carries them", () => {
    const event: ErrorEvent = {
      type: undefined,
      message: `opened ${DOSSIER_URL}`,
      exception: { values: [{ type: "Error", value: leaked }] },
      extra: { attemptsMade: 3, failedReason: leaked },
      breadcrumbs: [
        {
          category: "console",
          message: `[pass-sport-worker] job 1 failed: ${leaked}`,
          data: { arguments: [`[pass-sport-worker] job 1 failed: ${leaked}`], logger: "console" },
        },
      ],
    };

    const sent = JSON.stringify(scrubEvent(event));

    expect(sent).not.toContain("SECRET");
    expect(sent).not.toContain("sub-1");
    expect(event.exception?.values?.[0]?.value).toBe(
      `Failed query: ${QUERY}\nparams: [redacted]`,
    );
    expect(event.message).toBe(
      "opened https://demarche.numerique.gouv.fr/commencer/x?prefill_token=[redacted]",
    );
    expect(event.extra?.attemptsMade).toBe(3);
    expect(event.breadcrumbs?.[0]?.data?.logger).toBe("console");
  });

  it("leaves a clean event as it was", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "API Particulier 503" }] },
    };

    expect(scrubEvent(event)).toEqual({
      type: undefined,
      exception: { values: [{ type: "Error", value: "API Particulier 503" }] },
    });
  });
});
