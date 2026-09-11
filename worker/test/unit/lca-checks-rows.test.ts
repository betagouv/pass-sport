import { afterEach, describe, expect, it } from "vitest";
import {
  decideConfirmOutcome,
  decideSearchOutcome,
  rowSubject,
  rowToConfirmPayload,
  rowToSearchPayload,
  type PendingLcaRow,
} from "../../src/jobs/lca-checks-rows";
import { PENDING_CHECK_INSEE_CODE } from "../../src/lca/insee";
import type { ConfirmItem, SearchItem } from "../../src/lca/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const ALLOCATAIRE = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1990-03-14",
  birthplace: "75056",
  birthcountry: "99100",
};

const ENFANT = {
  family_name: "ZALQUIN",
  given_name: "Fenrys",
  birthdate: "2015-06-02",
};

const row = (overrides: Partial<PendingLcaRow> = {}): PendingLcaRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  source: "self",
  allocataireIdentite: ALLOCATAIRE,
  enfantIdentite: null,
  passSportCode: "PSP-STORED",
  allocataireFcSub: "sub-abc",
  lcaCheckAttempts: 0,
  ...overrides,
});

const searchItem = (overrides: Partial<SearchItem> = {}): SearchItem => ({
  id: 42,
  nom: ENFANT.family_name,
  prenom: ENFANT.given_name,
  date_naissance: ENFANT.birthdate,
  situation: "jeune",
  organisme: "CAF",
  matricule: "MATRICULE-1",
  hasMatricule: true,
  ...overrides,
});

const confirmItem = (idPsp: string): ConfirmItem => ({
  id: 42,
  id_psp: idPsp,
  nom: ENFANT.family_name,
  prenom: ENFANT.given_name,
  date_naissance: ENFANT.birthdate,
  situation: "jeune",
  organisme: "CAF",
});

afterEach(() => {
  delete process.env.LCA_PENDING_CHECK_INSEE_CODE;
});

describe("rowToSearchPayload", () => {
  it("names the allocataire on a 'self' row", () => {
    expect(rowToSearchPayload(row())).toEqual({
      beneficiaryLastname: ALLOCATAIRE.family_name,
      beneficiaryFirstname: ALLOCATAIRE.given_name,
      beneficiaryBirthDate: ALLOCATAIRE.birthdate,
      recipientResidencePlace: PENDING_CHECK_INSEE_CODE,
    });
  });

  it("names the enfant on an 'enfant' row", () => {
    const payload = rowToSearchPayload(row({ source: "enfant", enfantIdentite: ENFANT }));

    expect(payload).toMatchObject({
      beneficiaryLastname: ENFANT.family_name,
      beneficiaryFirstname: ENFANT.given_name,
      beneficiaryBirthDate: ENFANT.birthdate,
    });
  });

  it("sends the fictional commune on both sources", () => {
    const self = rowToSearchPayload(row());
    const enfant = rowToSearchPayload(row({ source: "enfant", enfantIdentite: ENFANT }));

    expect(self?.recipientResidencePlace).toBe(PENDING_CHECK_INSEE_CODE);
    expect(enfant?.recipientResidencePlace).toBe(PENDING_CHECK_INSEE_CODE);
  });

  it("lets LCA_PENDING_CHECK_INSEE_CODE override the constant", () => {
    process.env.LCA_PENDING_CHECK_INSEE_CODE = "12345";

    expect(rowToSearchPayload(row())?.recipientResidencePlace).toBe("12345");
  });

  // nom/prenom/dateNaissance are ONE key: a missing part is a different query, not a broader one.
  it.each(["family_name", "given_name", "birthdate"] as const)(
    "returns null when %s is missing",
    (field) => {
      const identity = { ...ENFANT, [field]: undefined };

      expect(rowToSearchPayload(row({ source: "enfant", enfantIdentite: identity }))).toBeNull();
    },
  );

  it("returns null on an 'enfant' row whose enfant_identite is absent", () => {
    expect(rowToSearchPayload(row({ source: "enfant", enfantIdentite: null }))).toBeNull();
  });
});

describe("rowToConfirmPayload", () => {
  it("names the allocataire on an 'enfant' row", () => {
    const payload = rowToConfirmPayload(
      row({ source: "enfant", enfantIdentite: ENFANT }),
      searchItem(),
    );

    expect(payload).toMatchObject({
      id: "42",
      situation: "jeune",
      organisme: "CAF",
      recipientLastname: ALLOCATAIRE.family_name,
      recipientFirstname: ALLOCATAIRE.given_name,
      recipientBirthDate: ALLOCATAIRE.birthdate,
      recipientBirthPlace: ALLOCATAIRE.birthplace,
      recipientBirthCountry: "FR",
      recipientCafNumber: "MATRICULE-1",
    });
  });

  it("routes the matricule to the INE for a CROUS boursier", () => {
    const payload = rowToConfirmPayload(
      row(),
      searchItem({ situation: "boursier", organisme: "cnous" }),
    );

    expect(payload.recipientIneNumber).toBe("MATRICULE-1");
    expect(payload.recipientCafNumber).toBeUndefined();
  });
});

describe("rowSubject", () => {
  it("maps source to the history subject", () => {
    expect(rowSubject(row())).toBe("self");
    expect(rowSubject(row({ source: "enfant" }))).toBe("enfant");
  });
});

describe("decideSearchOutcome", () => {
  it("reports a gateway failure as an error on the search stage", () => {
    expect(decideSearchOutcome({ message: "LCA /search failed: 502", httpStatus: 502 })).toEqual({
      kind: "error",
      stage: "search",
      message: "LCA /search failed: 502",
    });
  });

  it("reads an empty answer as still pending", () => {
    expect(decideSearchOutcome([])).toEqual({ kind: "still_pending", stage: "search" });
  });

  it("hands back the candidates otherwise", () => {
    const items = [searchItem()];

    expect(decideSearchOutcome(items)).toEqual({ kind: "candidates", items });
  });
});

describe("decideConfirmOutcome", () => {
  it("matches when LCA answers the code we stored", () => {
    expect(decideConfirmOutcome("PSP-STORED", [confirmItem("PSP-STORED")])).toEqual({
      kind: "match",
    });
  });

  it("reports another code rather than accepting it", () => {
    expect(decideConfirmOutcome("PSP-STORED", [confirmItem("PSP-OTHER")])).toEqual({
      kind: "other_code",
      code: "PSP-OTHER",
    });
  });

  it("reads an item without an id_psp as still pending", () => {
    const withoutCode = { ...confirmItem("ignored"), id_psp: "" };

    expect(decideConfirmOutcome("PSP-STORED", [withoutCode])).toEqual({
      kind: "still_pending",
      stage: "confirm",
    });
  });

  it("reads an empty answer as still pending", () => {
    expect(decideConfirmOutcome("PSP-STORED", [])).toEqual({
      kind: "still_pending",
      stage: "confirm",
    });
  });

  it("reports a gateway failure as an error on the confirm stage", () => {
    expect(
      decideConfirmOutcome("PSP-STORED", { message: "LCA /confirm failed: 500", httpStatus: 500 }),
    ).toEqual({ kind: "error", stage: "confirm", message: "LCA /confirm failed: 500" });
  });
});
