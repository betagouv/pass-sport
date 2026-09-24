import { describe, expect, it } from "vitest";
import {
  assertApiParticulierAnswered,
  isFinalAttempt,
  resourceEvent,
  resultStatus,
} from "../../src/eligibility/calls";
import type { ResourceResult } from "../../src/eligibility/types";

const row = (over: Partial<ResourceResult>): ResourceResult => ({
  resource: "cnous.etudiant_boursier_identite",
  label: "CROUS",
  httpStatus: 200,
  success: true,
  data: null,
  ...over,
});

// A 5xx carrying code 35000 is the data provider choking on this one identity, not the platform
// being down — the same distinction qf-batch makes.
const providerDataError = (httpStatus: number): ResourceResult =>
  row({
    httpStatus,
    success: false,
    error: "Erreur interne du fournisseur de données",
    errorCode: "35000",
    apiError: {
      code: "35000",
      title: "Erreur interne du fournisseur de données",
      meta: { provider: "CNAF" },
    },
  });

describe("resultStatus", () => {
  it.each([
    ["success", row({})],
    ["not_found", row({ httpStatus: 404, success: false })],
    ["invalid_request", row({ httpStatus: 422, success: false })],
    ["provider_error", providerDataError(502)],
    ["provider_error", providerDataError(500)],
    ["rate_limited", row({ httpStatus: 429, success: false, rateLimited: true })],
    ["error", row({ httpStatus: 502, success: false })],
    // The 404 is an answer about the person whatever code rides along with it.
    ["not_found", row({ httpStatus: 404, success: false, errorCode: "35000" })],
  ])("reads %s", (expected, result) => {
    expect(resultStatus(result)).toBe(expected);
  });
});

describe("assertApiParticulierAnswered", () => {
  // A 422 is a determination too: retrying cannot change params the API already rejected. The
  // chain pronounces without that resource rather than failing the job.
  it.each([
    ["a success", row({})],
    ["a 404", row({ httpStatus: 404, success: false })],
    ["a 422", row({ httpStatus: 422, success: false })],
  ])("lets %s through", (_case, result) => {
    expect(() => assertApiParticulierAnswered("job-1", result)).not.toThrow();
  });

  it.each([
    ["a 500", row({ httpStatus: 500, success: false })],
    ["a 502", row({ httpStatus: 502, success: false })],
    ["a 502 carrying another code", row({ httpStatus: 502, success: false, errorCode: "35008" })],
    // The provider may answer on a later attempt, so a 5xx/35000 is retried like any 5xx.
    ["a 502 carrying 35000", providerDataError(502)],
    ["a 500 carrying 35000", providerDataError(500)],
    ["a transport failure", row({ httpStatus: null, success: false })],
    // No httpStatus means no 5xx to read the code against — a transport failure is worth retrying.
    ["a transport failure carrying 35000", row({ httpStatus: null, success: false, errorCode: "35000" })],
  ])("fails the job on %s", (_case, result) => {
    expect(() => assertApiParticulierAnswered("job-1", result)).toThrow("gave no verdict");
  });
});

// Without these the history row of a failed call carries a flattened message and nothing to tell
// one 5xx from another, or to name the provider that dropped it.
describe("resourceEvent", () => {
  it("keeps the raw API error on a 422", () => {
    const result = row({
      httpStatus: 422,
      success: false,
      error: "Le paramètre nomNaissance est invalide",
      errorCode: "40001",
      apiError: { code: "40001", title: "Paramètre invalide" },
    });

    expect(resourceEvent(result, 12).responsePayload).toMatchObject({
      error_code: "40001",
      api_error: { code: "40001", title: "Paramètre invalide" },
    });
  });

  it.each([
    ["a 502 carrying 35000", providerDataError(502)],
    ["a 502 carrying nothing", row({ httpStatus: 502, success: false, errorCode: "35008" })],
  ])("keeps the raw API error on %s", (_case, result) => {
    expect(resourceEvent(result, 12).responsePayload).toMatchObject({
      error_code: result.errorCode,
    });
  });

  it("leaves them null on a success", () => {
    expect(resourceEvent(row({}), 12).responsePayload).toMatchObject({
      error_code: null,
      api_error: null,
    });
  });
});

describe("isFinalAttempt", () => {
  it.each([
    [0, 4, false],
    [2, 4, false],
    [3, 4, true],
    [0, 2, false],
    [1, 2, true],
    [0, undefined, true],
  ])("attemptsMade=%i out of %s -> %s", (attemptsMade, attempts, expected) => {
    expect(isFinalAttempt({ attemptsMade, opts: { attempts } })).toBe(expected);
  });
});
