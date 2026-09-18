import { describe, expect, it } from "vitest";
import {
  AEEH_RESOURCE,
  childAeehVerdict,
  findChildResource,
  hasAahRight,
  isAahBeneficiaryRow,
  readCaisse,
  readQuotientFamilial,
} from "../../src/eligibility/verdicts";
import type { ResourceResult } from "../../src/eligibility/types";

const answered = (resource: string, data: unknown): ResourceResult =>
  ({ resource, label: resource, httpStatus: 200, success: true, data }) as ResourceResult;

const notFound = (resource: string, childIndex?: number): ResourceResult => ({
  resource,
  label: resource,
  httpStatus: 404,
  success: false,
  data: null,
  childIndex,
});

const qfMonth = (valeur: number): ResourceResult =>
  answered("dss.quotient_familial_identite", {
    allocataires: [],
    enfants: [],
    quotient_familial: { valeur },
  });

describe("readQuotientFamilial", () => {
  // The monthly sweep stops on the month that opened the right, so the last answer is the
  // deciding one — and the one data/'s export picks.
  it("answers the last quotient_familial row, not the first", () => {
    const results = [qfMonth(900), qfMonth(650)];

    expect(readQuotientFamilial(results)?.quotient_familial.valeur).toBe(650);
  });

  it("ignores a month that answered 404", () => {
    const results = [qfMonth(900), notFound("dss.quotient_familial_identite")];

    expect(readQuotientFamilial(results)?.quotient_familial.valeur).toBe(900);
  });

  it("answers null when no month came back", () => {
    expect(readQuotientFamilial([])).toBeNull();
  });
});

const qfFournisseur = (fournisseur: string): ResourceResult =>
  answered("dss.quotient_familial_identite", {
    allocataires: [],
    enfants: [],
    quotient_familial: { valeur: 650, fournisseur },
  });

describe("readCaisse", () => {
  it.each([
    ["CNAF", "CAF"],
    ["CAF", "CAF"],
    ["MSA", "MSA"],
    [" msa ", "MSA"],
  ])("reads fournisseur %s as %s", (fournisseur, caisse) => {
    expect(readCaisse([qfFournisseur(fournisseur)])).toBe(caisse);
  });

  it("answers null rather than guessing a caisse", () => {
    expect(readCaisse([])).toBeNull();
    expect(readCaisse([qfMonth(650)])).toBeNull();
    expect(readCaisse([qfFournisseur("POLE_EMPLOI")])).toBeNull();
  });

  // Same deciding row as readQuotientFamilial: the month that opened the right.
  it("takes the last quotient_familial answer", () => {
    expect(readCaisse([qfFournisseur("CNAF"), qfFournisseur("MSA")])).toBe("MSA");
  });
});

describe("isAahBeneficiaryRow", () => {
  it("reads a 404 as 'pas bénéficiaire' rather than throwing", () => {
    expect(isAahBeneficiaryRow(notFound("dss.allocation_adulte_handicape_identite"))).toBe(false);
  });

  it("is false when the call was never made", () => {
    expect(isAahBeneficiaryRow(undefined)).toBe(false);
  });

  it("is true on an open right", () => {
    const row = answered("dss.allocation_adulte_handicape_identite", { est_beneficiaire: true });

    expect(isAahBeneficiaryRow(row)).toBe(true);
    expect(hasAahRight([row])).toBe(true);
  });
});

describe("childAeehVerdict", () => {
  it("distinguishes a refusal from an absent row", () => {
    expect(childAeehVerdict(notFound("dss.allocation_enfant_handicape_identite", 0))).toBe(false);
    expect(childAeehVerdict(undefined)).toBeNull();
  });

  it.each(["allocataire", "ouvrant_droit"])("grants on status %s", (status) => {
    expect(childAeehVerdict(answered("dss.allocation_enfant_handicape_identite", { status }))).toBe(
      true,
    );
  });
});

describe("findChildResource", () => {
  const rejected = (childIndex: number): ResourceResult => ({
    resource: AEEH_RESOURCE,
    label: AEEH_RESOURCE,
    httpStatus: 422,
    success: false,
    data: null,
    childIndex,
  });

  // A child rejected on France is asked again on the pays de naissance of the parent, which
  // leaves two rows under the same (resource, childIndex): the second one is the answer.
  it("answers the last row about that child, not the first", () => {
    const retried = {
      ...answered(AEEH_RESOURCE, { status: "allocataire" }),
      childIndex: 1,
    } as ResourceResult;
    const results = [rejected(1), retried];

    expect(findChildResource(results, AEEH_RESOURCE, 1)?.httpStatus).toBe(200);
    expect(childAeehVerdict(findChildResource(results, AEEH_RESOURCE, 1))).toBe(true);
  });

  it("keeps each child apart", () => {
    const results = [rejected(0), notFound(AEEH_RESOURCE, 1)];

    expect(findChildResource(results, AEEH_RESOURCE, 0)?.httpStatus).toBe(422);
    expect(findChildResource(results, AEEH_RESOURCE, 1)?.httpStatus).toBe(404);
    expect(findChildResource(results, AEEH_RESOURCE, 2)).toBeUndefined();
  });
});
