import { describe, expect, it } from "vitest";
import { toDssParams } from "../../src/eligibility/client";
import { toResourceResults, type HistoryApiRow } from "../../src/demarche-numerique/facts";
import {
  AEEH_RESOURCE,
  childAeehVerdict,
  findChildResource,
  readAah,
  readQuotientFamilial,
} from "../../src/eligibility/verdicts";

const QF = "dss.quotient_familial_identite";
const AAH = "dss.allocation_adulte_handicape_identite";

const qfRow = (valeur: number): HistoryApiRow => ({
  action: QF,
  status: "success",
  httpStatus: 200,
  bodyPayload: null,
  data: {
    allocataires: [],
    enfants: [
      { nom_naissance: "QUISTANE", prenoms: "Élyra Ola", date_naissance: "12/03/2015", sexe: "F" },
      { nom_naissance: "QUISTANE", prenoms: "Tozal", date_naissance: "2012-05-04", sexe: "M" },
    ],
    quotient_familial: { valeur },
  },
});

// Exactly what sequence.ts sent for each child: toDssParams of enfantToIdentity.
const ELYRA_PARAMS = toDssParams({
  family_name: "QUISTANE",
  given_name: "Élyra Ola",
  birthdate: "2015-03-12",
  gender: "female",
  birthcountry: "99100",
});
const TOZAL_PARAMS = toDssParams({
  family_name: "QUISTANE",
  given_name: "Tozal",
  birthdate: "2012-05-04",
  gender: "male",
  birthcountry: "99100",
});

const aeehRow = (params: Record<string, unknown>, status: string | null): HistoryApiRow => ({
  action: AEEH_RESOURCE,
  status: status === null ? "not_found" : "success",
  httpStatus: status === null ? 404 : 200,
  // As journaled: JSON drops the undefined keys.
  bodyPayload: JSON.parse(JSON.stringify(params)),
  data: status === null ? null : { status },
});

describe("toResourceResults", () => {
  it("keeps every quotient month, the deciding one last", () => {
    const results = toResourceResults([qfRow(650), qfRow(900)]);

    expect(results.filter((r) => r.resource === QF)).toHaveLength(2);
    expect(readQuotientFamilial(results)?.quotient_familial.valeur).toBe(900);
  });

  it("keeps only the latest AAH answer", () => {
    const aah = (est: boolean): HistoryApiRow => ({
      action: AAH,
      status: "success",
      httpStatus: 200,
      bodyPayload: null,
      data: { est_beneficiaire: est },
    });

    expect(readAah(toResourceResults([aah(true), aah(false)]))?.est_beneficiaire).toBe(false);
  });

  it("ties each AEEH answer to its child by the params it went out with", () => {
    const results = toResourceResults([
      qfRow(900),
      aeehRow(TOZAL_PARAMS, "allocataire"),
      aeehRow(ELYRA_PARAMS, null),
    ]);

    expect(childAeehVerdict(findChildResource(results, AEEH_RESOURCE, 0))).toBe(false);
    expect(childAeehVerdict(findChildResource(results, AEEH_RESOURCE, 1))).toBe(true);
  });

  it("takes the answer to the retry on the parent's country", () => {
    const results = toResourceResults([
      qfRow(900),
      aeehRow(ELYRA_PARAMS, null),
      aeehRow({ ...ELYRA_PARAMS, code_cog_insee_pays_naissance: "99350" }, "ouvrant_droit"),
    ]);

    expect(childAeehVerdict(findChildResource(results, AEEH_RESOURCE, 0))).toBe(true);
  });

  it("ignores an AEEH answer about no child of the latest quotient", () => {
    const stranger = { ...ELYRA_PARAMS, prenoms: ["Nivre"] };
    const results = toResourceResults([qfRow(900), aeehRow(stranger, "allocataire")]);

    expect(results.some((r) => r.resource === AEEH_RESOURCE)).toBe(false);
  });

  it("reads a payload the journal dropped as no answer", () => {
    const dropped = { ...qfRow(650), data: null };

    expect(readQuotientFamilial(toResourceResults([dropped]))).toBeNull();
  });
});
