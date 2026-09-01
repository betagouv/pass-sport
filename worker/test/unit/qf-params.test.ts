import { describe, expect, it } from "vitest";
import { toDssParams, toQfParams } from "../../src/eligibility/client";
import { QF_REFERENCE_MONTH, QF_REFERENCE_YEAR } from "../../src/eligibility/types";
import type { PivotIdentity } from "../../src/eligibility/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak Quorindel",
  gender: "female",
  birthdate: "1990-03-14",
  birthplace: "75056",
};

describe("toQfParams", () => {
  it("pins the reference period on août 2026", () => {
    expect(toQfParams(IDENTITY)).toMatchObject({
      annee: QF_REFERENCE_YEAR,
      mois: QF_REFERENCE_MONTH,
    });
    expect(QF_REFERENCE_YEAR).toBe("2026");
    expect(QF_REFERENCE_MONTH).toBe("8");
  });

  it("keeps the état civil params untouched", () => {
    expect(toQfParams(IDENTITY)).toMatchObject({
      nom_naissance: "OSTRENYA",
      prenoms: ["Velmorak", "Quorindel"],
      sexe_etat_civil: "F",
      code_cog_insee_commune_naissance: "75056",
    });
  });

  it("keeps the reference period distinct from the birthdate components", () => {
    const params = toQfParams(IDENTITY);

    expect(params.annee_date_naissance).toBe("1990");
    expect(params.mois_date_naissance).toBe("03");
    expect(params.jour_date_naissance).toBe("14");
  });
});

describe("toDssParams", () => {
  // AAH and AEEH share this builder and reject a reference period.
  it("sends no reference period", () => {
    const params = toDssParams(IDENTITY);

    expect(params).not.toHaveProperty("annee");
    expect(params).not.toHaveProperty("mois");
  });
});
