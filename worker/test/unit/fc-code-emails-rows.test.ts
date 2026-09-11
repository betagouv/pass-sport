import { describe, expect, it } from "vitest";
import {
  decideEmailKind,
  type FcCodeEmailRow,
  rowSubject,
  rowToEmailVariables,
} from "../../src/jobs/fc-code-emails-rows";
import { isTerminalEmailError } from "../../src/email/link-mobility";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const ALLOCATAIRE = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1990-03-14",
};

const ENFANT = {
  family_name: "ZALQUIN",
  given_name: "Fenrys",
  birthdate: "2015-06-02",
};

const row = (overrides: Partial<FcCodeEmailRow> = {}): FcCodeEmailRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  source: "self",
  situation: "AAH",
  allocataireIdentite: ALLOCATAIRE,
  enfantIdentite: null,
  passSportCode: "PSP-ABC",
  email: "allocataire@example.test",
  emailAttempts: 0,
  allocataireFcSub: "sub-abc",
  ...overrides,
});

describe("decideEmailKind", () => {
  it("picks the AAH template for an allocataire on the AAH route", () => {
    expect(decideEmailKind(row({ situation: "AAH" }))).toEqual({ kind: "code_direct_aah" });
  });

  it("picks the boursier template for an allocataire on the CROUS route", () => {
    expect(decideEmailKind(row({ situation: "CROUS" }))).toEqual({
      kind: "code_direct_boursier",
    });
  });

  it.each(["QF", "AEEH"] as const)("picks the indirect template on the %s route", (situation) => {
    const enfant = row({ source: "enfant", situation, enfantIdentite: ENFANT });

    expect(decideEmailKind(enfant)).toEqual({ kind: "code_indirect" });
  });

  // The rows written before the situation column existed. 'enfant' settles on its own; both routes
  // that produce one mail the same template.
  it("falls back to the indirect template for an enfant row with no situation", () => {
    const enfant = row({ source: "enfant", situation: null, enfantIdentite: ENFANT });

    expect(decideEmailKind(enfant)).toEqual({ kind: "code_indirect" });
  });

  // The residual case: AAH and the boursier routes are indistinguishable without the column, and
  // guessing would mail the wrong text.
  it("refuses to guess for a self row with no situation", () => {
    expect(decideEmailKind(row({ situation: null }))).toEqual({ skip: "unknown_situation" });
  });

  it("skips a row with no recipient", () => {
    expect(decideEmailKind(row({ email: null }))).toEqual({ skip: "no_recipient" });
  });

  it("skips a row with no code", () => {
    expect(decideEmailKind(row({ passSportCode: null }))).toEqual({ skip: "no_code" });
  });

  // A template rendered without these goes out with its merge tokens showing.
  it.each(["family_name", "given_name", "birthdate"] as const)(
    "skips a row whose beneficiary has no %s",
    (missing) => {
      const identity = { ...ALLOCATAIRE, [missing]: undefined };

      expect(decideEmailKind(row({ allocataireIdentite: identity }))).toEqual({
        skip: "missing_identity",
      });
    },
  );

  it("reads the enfant identity on enfant rows and the allocataire one on self rows", () => {
    // An enfant row whose allocataire is complete but whose child is not is still unmailable.
    const enfant = row({ source: "enfant", situation: "QF", enfantIdentite: null });

    expect(decideEmailKind(enfant)).toEqual({ skip: "missing_identity" });
  });
});

describe("rowSubject", () => {
  it("reads enfant rows as enfant and everything else as self", () => {
    expect(rowSubject(row({ source: "enfant" }))).toBe("enfant");
    expect(rowSubject(row({ source: "self" }))).toBe("self");
  });
});

describe("rowToEmailVariables", () => {
  it("names the allocataire as the beneficiary on a self row", () => {
    expect(rowToEmailVariables(row(), "code_direct_aah")).toEqual({
      kind: "code_direct_aah",
      BENEFICIAIRE_PRENOM: "Velmorak",
      BENEFICIAIRE_NOM: "Ostrenya",
      DATE_NAISSANCE_BENEFICIAIRE: "14/03/1990",
      CODE: "PSP-ABC",
    });
  });

  // The indirect template is the only one that names both: the allocataire reads it, the child is
  // its subject.
  it("names the child and the allocataire on an enfant row", () => {
    const enfant = row({ source: "enfant", situation: "QF", enfantIdentite: ENFANT });

    expect(rowToEmailVariables(enfant, "code_indirect")).toEqual({
      kind: "code_indirect",
      BENEFICIAIRE_PRENOM: "Fenrys",
      BENEFICIAIRE_NOM: "Zalquin",
      DATE_NAISSANCE_BENEFICIAIRE: "02/06/2015",
      CODE: "PSP-ABC",
      ALLOCATAIRE_PRENOM: "Velmorak",
      ALLOCATAIRE_NOM: "Ostrenya",
    });
  });
});

describe("isTerminalEmailError", () => {
  it.each(["2", "4", "17", "30"])("treats %s as beyond any resend", (code) => {
    expect(isTerminalEmailError([code])).toBe(true);
  });

  // The one rejection a resend is the right answer to.
  it("keeps a rate limit replayable", () => {
    expect(isTerminalEmailError(["63"])).toBe(false);
  });

  // Nothing is known about it, so freezing the row would silently drop a mail.
  it("keeps an unknown code replayable", () => {
    expect(isTerminalEmailError(["9999"])).toBe(false);
  });

  it("keeps a mixed list replayable — one recoverable code is enough", () => {
    expect(isTerminalEmailError(["30", "63"])).toBe(false);
  });

  it("says nothing about an empty list", () => {
    expect(isTerminalEmailError([])).toBe(false);
  });
});
