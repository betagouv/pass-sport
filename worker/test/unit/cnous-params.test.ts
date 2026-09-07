import { describe, expect, it } from "vitest";
import { CNOUS_IDENTITE_PATH, toCnousParams } from "../../src/eligibility/client";
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

describe("CNOUS étudiant boursier", () => {
  it("targets v5, the only version returning the INE", () => {
    expect(CNOUS_IDENTITE_PATH).toBe("/v5/cnous/etudiant_boursier/identite");
  });

  // client.get() sends keys verbatim, so a snake_case key would silently vanish on the wire.
  it("names every param in camelCase", () => {
    expect(toCnousParams(IDENTITY)).toEqual({
      nomNaissance: "OSTRENYA",
      prenoms: ["Velmorak", "Quorindel"],
      sexeEtatCivil: "F",
      codeCogInseeCommuneNaissance: "75056",
      anneeDateNaissance: "1990",
      moisDateNaissance: "03",
      jourDateNaissance: "14",
    });
  });

  it("leaves absent identity fields undefined rather than empty", () => {
    const params = toCnousParams({ family_name: "OSTRENYA" });

    expect(params.prenoms).toBeUndefined();
    expect(params.sexeEtatCivil).toBeUndefined();
    expect(params.codeCogInseeCommuneNaissance).toBeUndefined();
    expect(params.anneeDateNaissance).toBeUndefined();
  });
});
