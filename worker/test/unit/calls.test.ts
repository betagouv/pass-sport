import { describe, expect, it } from "vitest";
import { assertApiParticulierAnswered, resultStatus } from "../../src/eligibility/calls";
import type { ResourceResult } from "../../src/eligibility/types";

const row = (over: Partial<ResourceResult>): ResourceResult => ({
  resource: "cnous.etudiant_boursier_identite",
  label: "CROUS",
  httpStatus: 200,
  success: true,
  data: null,
  ...over,
});

describe("resultStatus", () => {
  it.each([
    ["success", row({})],
    ["not_found", row({ httpStatus: 404, success: false })],
    ["invalid_request", row({ httpStatus: 422, success: false })],
    ["rate_limited", row({ httpStatus: 429, success: false, rateLimited: true })],
    ["error", row({ httpStatus: 502, success: false })],
  ])("reads %s", (expected, result) => {
    expect(resultStatus(result)).toBe(expected);
  });
});

describe("assertApiParticulierAnswered", () => {
  // A 422 is a determination too: retrying cannot change params the API already rejected,
  // so the chain pronounces without that resource rather than failing the job.
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
    ["a transport failure", row({ httpStatus: null, success: false })],
  ])("fails the job on %s", (_case, result) => {
    expect(() => assertApiParticulierAnswered("job-1", result)).toThrow("gave no verdict");
  });
});
