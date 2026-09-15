import { describe, expect, it } from "vitest";
import { toDssParams, toQfParams } from "../../src/eligibility/client";
import {
  QF_REFERENCE_MONTH_MIN,
  QF_REFERENCE_YEAR,
  qfReferenceMonths,
} from "../../src/eligibility/types";
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
  it("pins the reference year on 2026 and defaults the month to août", () => {
    expect(toQfParams(IDENTITY)).toMatchObject({ annee: "2026", mois: "8" });
    expect(QF_REFERENCE_YEAR).toBe("2026");
    expect(QF_REFERENCE_MONTH_MIN).toBe(8);
  });

  it("sends the month it is given", () => {
    expect(toQfParams(IDENTITY, "11")).toMatchObject({ annee: "2026", mois: "11" });
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

describe("qfReferenceMonths", () => {
  it("stops at the current month of the campaign", () => {
    expect(qfReferenceMonths(new Date("2026-08-15T12:00:00Z"))).toEqual(["8"]);
    expect(qfReferenceMonths(new Date("2026-09-15T12:00:00Z"))).toEqual(["8", "9"]);
    expect(qfReferenceMonths(new Date("2026-12-31T12:00:00Z"))).toEqual([
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("never answers an empty list, whatever the date", () => {
    expect(qfReferenceMonths(new Date("2026-07-15T12:00:00Z"))).toEqual(["8"]);
    expect(qfReferenceMonths(new Date("2027-03-01T12:00:00Z"))).toHaveLength(5);
  });

  // 23:30 UTC on 31 August is already 1 September in Paris, and that month has a value to serve.
  it("reads the month in Paris time, not UTC", () => {
    expect(qfReferenceMonths(new Date("2026-08-31T23:30:00Z"))).toEqual(["8", "9"]);
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
