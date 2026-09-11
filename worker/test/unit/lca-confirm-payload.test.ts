import { describe, expect, it } from "vitest";
import { buildConfirmQuery, buildSearchQuery } from "../../src/lca/client";
import { buildConfirmPayload, cogCountryToIso } from "../../src/lca/candidates";
import type { SearchItem } from "../../src/lca/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY = {
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1990-03-14",
  birthplace: "75056",
  birthcountry: "99100",
};

const searchItem = (overrides: Partial<SearchItem> = {}): SearchItem => ({
  id: 7,
  nom: "ZALQUIN",
  prenom: "Fenrys",
  date_naissance: "2015-06-02",
  situation: "jeune",
  organisme: "CAF",
  matricule: "MATRICULE-1",
  hasMatricule: true,
  ...overrides,
});

describe("cogCountryToIso", () => {
  it("maps the COG for France to its ISO code", () => {
    expect(cogCountryToIso("99100")).toBe("FR");
  });

  // The param is optional, and a raw COG is not an ISO code.
  it("omits any other country", () => {
    expect(cogCountryToIso("99134")).toBeUndefined();
    expect(cogCountryToIso(undefined)).toBeUndefined();
  });
});

describe("buildConfirmPayload", () => {
  it("carries the search item's own id, situation and organisme", () => {
    expect(buildConfirmPayload(searchItem(), IDENTITY)).toMatchObject({
      id: "7",
      situation: "jeune",
      organisme: "CAF",
    });
  });

  // 'AEEH' is what our own pipeline writes into the LCA base, and /search hands it back —
  // but /confirm only knows the four campaign situations.
  it("translates an AEEH search answer into 'jeune'", () => {
    expect(buildConfirmPayload(searchItem({ situation: "AEEH" }), IDENTITY).situation).toBe(
      "jeune",
    );
  });

  it.each(["jeune", "AAH", "boursier"] as const)("leaves situation %s untouched", (situation) => {
    expect(buildConfirmPayload(searchItem({ situation }), IDENTITY).situation).toBe(situation);
  });

  it("routes the matricule to the CAF number outside CROUS", () => {
    const payload = buildConfirmPayload(searchItem(), IDENTITY);

    expect(payload.recipientCafNumber).toBe("MATRICULE-1");
    expect(payload.recipientIneNumber).toBeUndefined();
  });

  it("routes the matricule to the INE for a boursier at cnous", () => {
    const payload = buildConfirmPayload(
      searchItem({ situation: "boursier", organisme: "cnous" }),
      IDENTITY,
    );

    expect(payload.recipientIneNumber).toBe("MATRICULE-1");
    expect(payload.recipientCafNumber).toBeUndefined();
  });

  // A boursier outside cnous is on the CAF/MSA route, so the matricule is not an INE.
  it("keeps a boursier outside cnous on the CAF number", () => {
    const payload = buildConfirmPayload(searchItem({ situation: "boursier" }), IDENTITY);

    expect(payload.recipientCafNumber).toBe("MATRICULE-1");
    expect(payload.recipientIneNumber).toBeUndefined();
  });

  it("leaves both numbers unset when the search answered no matricule", () => {
    const payload = buildConfirmPayload(searchItem({ matricule: "" }), IDENTITY);

    expect(payload.recipientCafNumber).toBeUndefined();
    expect(payload.recipientIneNumber).toBeUndefined();
  });

  it("accepts an allocataire_identite missing everything", () => {
    const payload = buildConfirmPayload(searchItem(), {});

    expect(payload).toMatchObject({ id: "7", recipientFirstname: "" });
    expect(payload.recipientLastname).toBeUndefined();
    expect(payload.recipientBirthCountry).toBeUndefined();
  });
});

describe("buildSearchQuery", () => {
  it("emits exactly the four search params", () => {
    const params = buildSearchQuery({
      beneficiaryLastname: "ZALQUIN",
      beneficiaryFirstname: "Fenrys",
      beneficiaryBirthDate: "2015-06-02",
      recipientResidencePlace: "99999",
    });

    expect([...params.keys()]).toEqual(["nom", "prenom", "dateNaissance", "codeInsee"]);
    expect(params.get("codeInsee")).toBe("99999");
  });
});

describe("buildConfirmQuery", () => {
  it("maps the payload to LCA's own param names", () => {
    const params = buildConfirmQuery(buildConfirmPayload(searchItem(), IDENTITY));

    expect(params.get("id")).toBe("7");
    expect(params.get("allocataireName")).toBe(IDENTITY.family_name);
    expect(params.get("allocataireSurname")).toBe(IDENTITY.given_name);
    expect(params.get("matricule")).toBe("MATRICULE-1");
    expect(params.get("codeInseeBirth")).toBe(IDENTITY.birthplace);
    expect(params.get("allocataireBirthDate")).toBe(IDENTITY.birthdate);
    expect(params.get("codeIso")).toBe("FR");
  });

  // Absent means absent: an empty `param=` is a value LCA would have to interpret.
  it("omits absent optional params rather than emitting them empty", () => {
    const params = buildConfirmQuery(buildConfirmPayload(searchItem({ matricule: "" }), {}));

    expect([...params.keys()]).toEqual(["id", "situation", "organisme"]);
  });
});
