import { describe, expect, it } from "vitest";
import { hasVerdict, screenRow, verdictColumns } from "../../src/scripts/qf-batch";
import { AdaptiveRatePacer } from "../../src/scripts/rate-pacer";
import type { PivotIdentity, ResourceResult } from "../../src/eligibility/types";

const identity: PivotIdentity = {
  family_name: "Martin",
  given_name: "Camille",
  birthdate: "2004-05-15",
  birthcountry: "99100",
};

// Ceilings far above what a test spends, so acquire() never actually paces.
const pacer = (): AdaptiveRatePacer =>
  new AdaptiveRatePacer({
    dayRatePerMinute: 10_000,
    nightRatePerMinute: 10_000,
    initialRatePerMinute: 10_000,
    sleep: async () => {},
  });

const countingClient = (answer: ResourceResult) => {
  let calls = 0;
  return {
    calls: () => calls,
    quotientFamilial: async (): Promise<ResourceResult> => {
      calls += 1;
      return answer;
    },
  };
};

const answer = (over: Partial<ResourceResult>): ResourceResult => ({
  resource: "dss.quotient_familial_identite",
  label: "quotient familial",
  httpStatus: 200,
  success: true,
  data: null,
  ...over,
});

const rejected = answer({
  httpStatus: 422,
  success: false,
  error: "Le paramètre codePaysNaissance est invalide",
  errorCode: "40001",
  apiError: { code: "40001", title: "Paramètre invalide" },
});

describe("screenRow on a 422", () => {
  // The params are refused deterministically, so the three MAX_ATTEMPTS the row used to burn
  // back-to-back bought nothing — and the next run burned three more.
  it("calls the API once and settles the row", async () => {
    const client = countingClient(rejected);

    const verdict = await screenRow(client, identity, pacer());

    expect(client.calls()).toBe(1);
    expect(verdict.value).toBeNull();
    expect(verdict.invalidRequest).toBe(true);
    expect(verdict.error).toBe("Le paramètre codePaysNaissance est invalide");
  });

  it("writes a settled status the next run will not re-call", async () => {
    const columns = verdictColumns(await screenRow(countingClient(rejected), identity, pacer()));

    expect(columns.qf_status).toBe("requete_invalide");
    expect(columns.qf_http_status).toBe("422");
    expect(columns.qf_value).toBe("");
    expect(JSON.parse(columns.qf_error_details)).toEqual({
      code: "40001",
      title: "Paramètre invalide",
    });
    expect(hasVerdict(columns)).toBe(true);
  });
});

// Unchanged by the 422 work, and the contrast that makes it readable: the provider failed on this
// row's data rather than refusing the question, so the row stays unsettled and is retried next run.
describe("screenRow on a 5xx carrying 35000", () => {
  it("calls the API once and leaves the row unsettled", async () => {
    const client = countingClient(
      answer({
        httpStatus: 502,
        success: false,
        error: "Erreur interne du fournisseur de données",
        errorCode: "35000",
        apiError: { code: "35000", meta: { provider: "CNAF" } },
      }),
    );

    const columns = verdictColumns(await screenRow(client, identity, pacer()));

    expect(client.calls()).toBe(1);
    expect(columns.qf_status).toBe("");
    expect(hasVerdict(columns)).toBe(false);
  });
});
