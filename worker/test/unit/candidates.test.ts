import { describe, expect, it } from "vitest";
import { listBeneficiaryCandidates, readConjointIdentite } from "../../src/eligibility/candidates";
import {
  pivotIsHouseholdChild,
  toIsoDate,
  type PersonneQuotientFamilial,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceResult,
} from "../../src/eligibility/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1990-03-14",
};

// The defaults keep the household out of the way: no allocataire to match the pivot against, and
// a quotient above the threshold, so neither QF eligibility nor the household-child guard is
// under test unless a case asks for it.
const qfResult = (
  enfants: QuotientFamilialData["enfants"],
  allocataires: QuotientFamilialData["allocataires"] = [],
  valeur = 9999,
): ResourceResult => ({
  resource: "dss.quotient_familial",
  label: "Quotient familial",
  httpStatus: 200,
  success: true,
  data: { allocataires, enfants, quotient_familial: { valeur } },
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

const CONNECTED: PersonneQuotientFamilial = {
  nom_naissance: "OSTRENYA",
  prenoms: "Velmorak",
  date_naissance: "14/03/1990",
  sexe: "F",
};

const CONJOINT: PersonneQuotientFamilial = {
  nom_naissance: "VOKTARIMENDO",
  nom_usage: "OSTRENYA",
  prenoms: "Tarnu Jean",
  date_naissance: "17/11/1982",
  sexe: "M",
};

const qfHousehold = (allocataires: PersonneQuotientFamilial[]): QuotientFamilialData => ({
  allocataires,
  enfants: [],
  quotient_familial: { valeur: 500 },
});

// The incident this guard exists for: a 24 ans still attached to their parents' CAF dossier. The
// quotient_familial endpoint answers with the foyer the pivot belongs to, so it hands back the
// PARENTS' foyer — the connected user among the enfants, next to a 12 ans sibling the household
// quotient covers. 24 ans is inside both self windows, so the self row is queried and kept.
const JEUNE_RATTACHE: PivotIdentity = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "2002-05-10",
};

const PARENTS: PersonneQuotientFamilial[] = [
  { nom_naissance: "OSTRENYA", prenoms: "Handrivel", date_naissance: "12/07/1971", sexe: "F" },
  { nom_naissance: "VOKTARIMENDO", prenoms: "Tarnu", date_naissance: "17/11/1969", sexe: "M" },
];

const FRATRIE: PersonneQuotientFamilial[] = [
  { nom_naissance: "OSTRENYA", prenoms: "Velmorak", date_naissance: "10/05/2002", sexe: "F" },
  { nom_naissance: "OSTRENYA", prenoms: "Quorindel", date_naissance: "03/09/2014", sexe: "M" },
];

const CADET = FRATRIE[1];

describe("listBeneficiaryCandidates — pivot rattaché au foyer de ses parents", () => {
  it("opens no child route when the connected user is himself an enfant of the foyer", () => {
    const candidates = listBeneficiaryCandidates(JEUNE_RATTACHE, [
      qfResult(FRATRIE, PARENTS, 500),
    ]);

    expect(candidates.map((c) => c.source)).toEqual(["self"]);
    expect(candidates[0].eligibilities).toEqual([]);
  });

  it("says why, so the refusal is not read as a household above the threshold", () => {
    const candidates = listBeneficiaryCandidates(JEUNE_RATTACHE, [
      qfResult(FRATRIE, PARENTS, 500),
    ]);

    expect(candidates[0].reasons.join(" ")).toMatch(/rattaché au foyer de ses parents/);
  });

  // The whole point of the guard: the sibling is eligible, but not through this allocataire.
  it("drops the eligible cadet rather than attaching him to his frère", () => {
    const candidates = listBeneficiaryCandidates(JEUNE_RATTACHE, [
      qfResult(FRATRIE, PARENTS, 500),
    ]);

    expect(candidates.some((c) => c.firstname === "Quorindel")).toBe(false);
  });

  it("triggers on an ISO date from the caisse as well as DD/MM/YYYY", () => {
    const fratrieIso = FRATRIE.map((enfant) => ({
      ...enfant,
      date_naissance: toIsoDate(enfant.date_naissance) ?? undefined,
    }));

    const candidates = listBeneficiaryCandidates(JEUNE_RATTACHE, [
      qfResult(fratrieIso, PARENTS, 500),
    ]);

    expect(candidates.map((c) => c.source)).toEqual(["self"]);
  });

  // Non-regression: the nominal foyer, where the connected user IS an allocataire.
  it("serves the children as before when the pivot is one of the allocataires", () => {
    const parent: PivotIdentity = {
      family_name: "OSTRENYA",
      given_name: "Handrivel",
      birthdate: "1971-07-12",
    };

    const candidates = listBeneficiaryCandidates(parent, [qfResult([CADET], PARENTS, 500)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      source: "enfant",
      firstname: "Quorindel",
      eligibilities: ["QF"],
    });
  });

  // A pivot the answer does not place anywhere is left alone: a false refusal on a legitimate
  // family would be worse than the case being fixed.
  it("serves the children when the pivot appears neither as allocataire nor as enfant", () => {
    const candidates = listBeneficiaryCandidates(IDENTITY, [qfResult([CADET], PARENTS, 500)]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ source: "enfant", eligibilities: ["QF"] });
  });
});

describe("pivotIsHouseholdChild", () => {
  const foyer = (
    allocataires: PersonneQuotientFamilial[],
    enfants: PersonneQuotientFamilial[],
  ): QuotientFamilialData => ({ allocataires, enfants, quotient_familial: { valeur: 500 } });

  it("is true for a pivot among the enfants and absent from the allocataires", () => {
    expect(pivotIsHouseholdChild(foyer(PARENTS, FRATRIE), "2002-05-10")).toBe(true);
  });

  it("is false for a pivot among the allocataires", () => {
    expect(pivotIsHouseholdChild(foyer(PARENTS, [CADET]), "1971-07-12")).toBe(false);
  });

  it("is false for a pivot the answer places nowhere", () => {
    expect(pivotIsHouseholdChild(foyer(PARENTS, [CADET]), "1990-03-14")).toBe(false);
  });

  // Nobody can be both, but reading the answer that way would refuse a genuine allocataire.
  it("is false for a pivot carried by both arrays", () => {
    expect(pivotIsHouseholdChild(foyer(FRATRIE, FRATRIE), "2002-05-10")).toBe(false);
  });

  it("is false without a pivot birthdate to match on", () => {
    expect(pivotIsHouseholdChild(foyer(PARENTS, FRATRIE), undefined)).toBe(false);
  });

  it("is false without a quotient_familial answer at all", () => {
    expect(pivotIsHouseholdChild(null, "2002-05-10")).toBe(false);
  });
});

describe("readConjointIdentite", () => {
  it("returns the OTHER entry of the couple, converted to the pivot vocabulary", () => {
    const conjoint = readConjointIdentite(
      qfHousehold([CONNECTED, CONJOINT]),
      IDENTITY.birthdate,
    );

    expect(conjoint).toEqual({
      family_name: "VOKTARIMENDO",
      preferred_username: "OSTRENYA",
      given_name: "Tarnu Jean",
      birthdate: "1982-11-17",
      gender: "male",
    });
  });

  it("identifies the connected entry wherever it sits in the array", () => {
    const conjoint = readConjointIdentite(
      qfHousehold([CONJOINT, CONNECTED]),
      IDENTITY.birthdate,
    );

    expect(conjoint?.family_name).toBe("VOKTARIMENDO");
  });

  it("accepts ISO dates from the caisse as well as DD/MM/YYYY", () => {
    const conjoint = readConjointIdentite(
      qfHousehold([
        { ...CONNECTED, date_naissance: "1990-03-14" },
        { ...CONJOINT, date_naissance: "1982-11-17" },
      ]),
      IDENTITY.birthdate,
    );

    expect(conjoint?.birthdate).toBe("1982-11-17");
  });

  it("finds no conjoint in a single-allocataire household", () => {
    expect(readConjointIdentite(qfHousehold([CONNECTED]), IDENTITY.birthdate)).toBeNull();
  });

  it("finds no conjoint without a QF answer", () => {
    expect(readConjointIdentite(null, IDENTITY.birthdate)).toBeNull();
  });

  it("finds no conjoint without a pivot birthdate to identify the connected entry", () => {
    expect(readConjointIdentite(qfHousehold([CONNECTED, CONJOINT]), undefined)).toBeNull();
  });

  it("gives up on a couple where no entry carries the pivot birthdate", () => {
    const couple = [
      { ...CONNECTED, date_naissance: "01/01/1991" },
      CONJOINT,
    ];

    expect(readConjointIdentite(qfHousehold(couple), IDENTITY.birthdate)).toBeNull();
  });

  it("gives up on a couple where both entries carry the pivot birthdate", () => {
    const couple = [CONNECTED, { ...CONJOINT, date_naissance: "14/03/1990" }];

    expect(readConjointIdentite(qfHousehold(couple), IDENTITY.birthdate)).toBeNull();
  });

  it("omits the keys the caisse did not serve", () => {
    const conjoint = readConjointIdentite(
      qfHousehold([CONNECTED, { nom_naissance: "VOKTARIMENDO" }]),
      IDENTITY.birthdate,
    );

    expect(conjoint).toEqual({
      family_name: "VOKTARIMENDO",
      preferred_username: undefined,
      given_name: undefined,
      birthdate: undefined,
      gender: undefined,
    });
  });
});
