import { describe, expect, it } from "vitest";
import { listBeneficiaryCandidates } from "../../src/lca/candidates";
import type { PivotIdentity, QuotientFamilialData, ResourceResult } from "../../src/eligibility/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1990-03-14",
};

const qfResult = (enfants: QuotientFamilialData["enfants"]): ResourceResult => ({
  resource: "dss.quotient_familial",
  label: "Quotient familial",
  httpStatus: 200,
  success: true,
  data: {
    allocataires: [],
    enfants,
    quotient_familial: { valeur: 9999 }, // above threshold: QF eligibility itself is not under test here
  },
});

describe("listBeneficiaryCandidates — enfant gender", () => {
  it("maps sexe 'F' to gender 'female'", () => {
    const candidates = listBeneficiaryCandidates(
      IDENTITY,
      [
        qfResult([
          { nom_naissance: "ZALQUIN", prenoms: "Fenrys", date_naissance: "2015-06-02", sexe: "F" },
        ]),
      ],
      [],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: "enfant", gender: "female" });
  });

  it("maps sexe 'M' to gender 'male'", () => {
    const candidates = listBeneficiaryCandidates(
      IDENTITY,
      [
        qfResult([
          { nom_naissance: "ZALQUIN", prenoms: "Nyxarel", date_naissance: "2015-06-02", sexe: "M" },
        ]),
      ],
      [],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: "enfant", gender: "male" });
  });

  it("leaves gender unset when sexe is absent or unrecognised", () => {
    const candidates = listBeneficiaryCandidates(
      IDENTITY,
      [
        qfResult([
          { nom_naissance: "ZALQUIN", prenoms: "Quorindel", date_naissance: "2015-06-02" },
        ]),
      ],
      [],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].gender).toBeUndefined();
  });
});
