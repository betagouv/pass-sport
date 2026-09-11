import { describe, expect, it } from "vitest";
import { listBeneficiaryCandidates } from "../../src/eligibility/candidates";
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

const aahResult = (estBeneficiaire: boolean): ResourceResult => ({
  resource: "dss.allocation_adulte_handicape_identite",
  label: "AAH",
  httpStatus: 200,
  success: true,
  data: { est_beneficiaire: estBeneficiaire },
});

// The allocataire only becomes a candidate when their birthdate falls in a window sequence.ts
// actually queries — otherwise a row would claim a verdict about someone nobody asked about.
describe("listBeneficiaryCandidates — allocataire", () => {
  it("carries an allocataire inside the AAH window", () => {
    const candidates = listBeneficiaryCandidates({ ...IDENTITY, birthdate: "2004-05-15" }, [
      qfResult([]),
      aahResult(true),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: "self", eligibilities: ["AAH"] });
  });

  it("keeps a queried allocataire without any open route", () => {
    const candidates = listBeneficiaryCandidates({ ...IDENTITY, birthdate: "2004-05-15" }, [
      qfResult([]),
      aahResult(false),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: "self", eligibilities: [] });
  });

  it("skips an allocataire outside both self windows when their children carry the job", () => {
    const candidates = listBeneficiaryCandidates(IDENTITY, [
      qfResult([
        { nom_naissance: "ZALQUIN", prenoms: "Fenrys", date_naissance: "2015-06-02", sexe: "F" },
      ]),
      aahResult(true),
    ]);

    expect(candidates.map((c) => c.source)).toEqual(["enfant"]);
  });

  // Otherwise nobody at all would be recorded, and the run would be indistinguishable from one
  // that never happened.
  it("falls back to the allocataire when nothing else is known", () => {
    const candidates = listBeneficiaryCandidates(IDENTITY, [qfResult([]), aahResult(true)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      source: "self",
      lastname: "OSTRENYA",
      firstname: "Velmorak",
      birthdate: "1990-03-14",
      eligibilities: [],
    });
  });

  it("has nobody to fall back to when the pivot cannot name the allocataire", () => {
    const { given_name: _givenName, ...withoutGivenName } = IDENTITY;

    expect(listBeneficiaryCandidates(withoutGivenName, [qfResult([])])).toHaveLength(0);
  });
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
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].gender).toBeUndefined();
  });
});

describe("listBeneficiaryCandidates — nom", () => {
  it("names an enfant by their nom de naissance, never their nom d'usage", () => {
    const candidates = listBeneficiaryCandidates(
      IDENTITY,
      [
        qfResult([
          {
            nom_naissance: "ZALQUIN",
            nom_usage: "BRAVENNE",
            prenoms: "Fenrys",
            date_naissance: "2015-06-02",
            sexe: "F",
          },
        ]),
      ],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].lastname).toBe("ZALQUIN");
  });

  it("skips an enfant carrying only a nom d'usage", () => {
    const candidates = listBeneficiaryCandidates(
      IDENTITY,
      [
        qfResult([
          { nom_usage: "BRAVENNE", prenoms: "Fenrys", date_naissance: "2015-06-02", sexe: "F" },
        ]),
      ],
    );

    expect(candidates.filter((c) => c.source === "enfant")).toHaveLength(0);
  });

  // The nom d'usage is carried without ever naming the child: the write-back will match on it,
  // so dropping it here would leave those rows unmatchable.
  it("carries the nom d'usage alongside the name it does not use", () => {
    const candidates = listBeneficiaryCandidates(IDENTITY, [
      qfResult([
        {
          nom_naissance: "ZALQUIN",
          nom_usage: "BRAVENNE",
          prenoms: "Fenrys",
          date_naissance: "2015-06-02",
          sexe: "F",
        },
      ]),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ lastname: "ZALQUIN", nomUsage: "BRAVENNE" });
  });

  it("leaves nomUsage unset when the QF row carries none", () => {
    const candidates = listBeneficiaryCandidates(IDENTITY, [
      qfResult([
        { nom_naissance: "ZALQUIN", prenoms: "Fenrys", date_naissance: "2015-06-02", sexe: "F" },
      ]),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].nomUsage).toBeUndefined();
  });
});
