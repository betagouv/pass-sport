import { describe, expect, it } from "vitest";
import {
  birthplaceAnnotation,
  currentCorsicanBirthplace,
  mayotteFallback,
  needsBirthplaceFallback,
} from "../../src/eligibility/birthplace";
import type { PivotIdentity, ResourceResult } from "../../src/eligibility/types";

const NE_A = (birthplace: string, birthcountry = "99100"): PivotIdentity => ({
  family_name: "VORANDEL",
  given_name: "Tissamir",
  birthdate: "1968-03-02",
  birthplace,
  birthcountry,
});

const row = (httpStatus: number): ResourceResult => ({
  resource: "dss.quotient_familial_identite",
  label: "QF",
  httpStatus,
  success: httpStatus === 200,
  data: null,
});

describe("currentCorsicanBirthplace", () => {
  it.each([
    ["20033", "2B033"],
    ["20004", "2A004"],
    // Merged after 1976: the current commune carries another number.
    ["20044", "2B063"],
  ])("rewrites %s to %s", (fc, current) => {
    expect(currentCorsicanBirthplace(NE_A(fc)).birthplace).toBe(current);
  });

  it("keeps a current Corsican code", () => {
    const identity = NE_A("2B033");
    expect(currentCorsicanBirthplace(identity)).toBe(identity);
  });

  it("keeps a continental code", () => {
    const identity = NE_A("61157");
    expect(currentCorsicanBirthplace(identity)).toBe(identity);
  });

  it("never touches a birthplace abroad", () => {
    const identity = NE_A("20033", "99135");
    expect(currentCorsicanBirthplace(identity)).toBe(identity);
  });

  it("rewrites when FranceConnect served no pays de naissance", () => {
    const { birthcountry: _omitted, ...identity } = NE_A("20033");
    expect(currentCorsicanBirthplace(identity).birthplace).toBe("2B033");
  });
});

describe("mayotteFallback", () => {
  it.each([
    ["98501", "97601"],
    ["98517", "97617"],
  ])("offers %s -> %s", (fc, current) => {
    expect(mayotteFallback(NE_A(fc))?.birthplace).toBe(current);
  });

  it.each(["97601", "20033", "98611"])("offers nothing for %s", (code) => {
    expect(mayotteFallback(NE_A(code))).toBeNull();
  });
});

describe("needsBirthplaceFallback", () => {
  it.each([
    [404, true],
    [422, true],
    [200, false],
    [503, false],
  ])("on %i: %s", (status, expected) => {
    expect(needsBirthplaceFallback(row(status))).toBe(expected);
  });
});

describe("birthplaceAnnotation", () => {
  it("is absent when the code sent is FranceConnect's", () => {
    expect(birthplaceAnnotation(NE_A("2B033"), NE_A("2B033"), "corse_1976")).toBeUndefined();
  });

  it("names both codes and the rule", () => {
    expect(birthplaceAnnotation(NE_A("20033"), NE_A("2B033"), "corse_1976")).toEqual({
      birthplace_fallback: { rule: "corse_1976", code_fc: "20033", code_envoye: "2B033" },
    });
  });
});
