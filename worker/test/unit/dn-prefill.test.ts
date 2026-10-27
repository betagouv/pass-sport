import { describe, expect, it } from "vitest";
import type { DnChamps } from "../../src/demarche-numerique/champs";
import { buildPrefill, type LastRunRow } from "../../src/demarche-numerique/prefill";
import type {
  PersonneQuotientFamilial,
  QuotientFamilialData,
  ResourceResult,
} from "../../src/eligibility/types";

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY = {
  sub: "fc-sub-prefill",
  family_name: "OSTRENYA",
  given_name: "Velmorak",
  birthdate: "1985-04-02",
  gender: "female" as const,
};

const CHAMPS: DnChamps = {
  allocataireGenre: { id: "GENRE", values: { male: "Masculin", female: "Féminin" } },
  beneficiaireDe: { id: "BENEF", values: { aah: "AAH", bourse: "Bourse" } },
  ine: { id: "INE" },
  caisse: { id: "CAISSE", values: { CAF: "CAF", MSA: "MSA" } },
  dateNaissance: { id: "NAISSANCE" },
  aDesEnfants: { id: "ENFANTS_OUI", values: { yes: "true", no: "false" } },
  caisseEnfants: { id: "CAISSE_ENFANTS", values: { CAF: "CAF", MSA: "MSA" } },
  foyerQf: { id: "FOYER_QF", values: { yes: "true", no: "false" } },
  enfantsAeeh: { id: "ENFANTS_AEEH", values: { yes: "true", no: "false" } },
  enfants: {
    id: "ENFANTS",
    champs: {
      aeeh: { id: "E_AEEH", values: { yes: "true", no: "false" } },
      genre: { id: "E_GENRE", values: { male: "Masculin", female: "Féminin" } },
      prenom: { id: "E_PRENOM" },
      nom: { id: "E_NOM" },
      dateNaissance: { id: "E_NAISSANCE" },
    },
  },
};

const ELYRA: PersonneQuotientFamilial = {
  nom_naissance: "QUISTANE",
  prenoms: "Élyra",
  date_naissance: "12/03/2015",
  sexe: "F",
};
const TOZAL: PersonneQuotientFamilial = {
  nom_naissance: "QUISTANE",
  prenoms: "Tozal",
  date_naissance: "04/05/2012",
  sexe: "M",
};
// 21 ans at the reference date: outside every campaign window.
const DORVAT: PersonneQuotientFamilial = {
  nom_naissance: "QUISTANE",
  prenoms: "Dorvat",
  date_naissance: "01/01/2005",
  sexe: "M",
};

const qf = (
  enfants: PersonneQuotientFamilial[],
  valeur = 850,
  extra: Partial<QuotientFamilialData> = {},
): ResourceResult => ({
  resource: "dss.quotient_familial_identite",
  label: "QF",
  httpStatus: 200,
  success: true,
  data: {
    allocataires: [
      { nom_naissance: "OSTRENYA", prenoms: "Velmorak", date_naissance: "02/04/1985", sexe: "F" },
    ],
    enfants,
    quotient_familial: { valeur, fournisseur: "CNAF", annee: 2026, mois: 10 },
    ...extra,
  },
});

const aeeh = (childIndex: number, status: string | null): ResourceResult => ({
  resource: "dss.allocation_enfant_handicape_identite",
  label: "AEEH",
  httpStatus: status === null ? 404 : 200,
  success: status !== null,
  data: status === null ? null : { status },
  childIndex,
});

const self = (data: Record<string, unknown>, resource: string): ResourceResult => ({
  resource,
  label: resource,
  httpStatus: 200,
  success: true,
  data: data as ResourceResult["data"],
});

const refusedChild = (p: PersonneQuotientFamilial, birthdate: string): LastRunRow => ({
  source: "enfant",
  familyName: p.nom_naissance ?? null,
  givenName: p.prenoms ?? null,
  birthdate,
  verdict: "not_eligible",
});

const LAST_RUN: LastRunRow[] = [
  refusedChild(ELYRA, "2015-03-12"),
  refusedChild(TOZAL, "2012-05-04"),
  refusedChild(DORVAT, "2005-01-01"),
];

const build = (results: ResourceResult[], lastRun: LastRunRow[] = LAST_RUN, identity = IDENTITY) =>
  buildPrefill({ identity, results, lastRun }, CHAMPS);

describe("buildPrefill", () => {
  it("pre-fills a refused household from FranceConnect and its API Particulier answers", () => {
    const { body, filled } = build([qf([ELYRA, TOZAL, DORVAT]), aeeh(0, null), aeeh(1, null)]);

    expect(body).toEqual({
      identite_nom: "OSTRENYA",
      identite_prenom: "Velmorak",
      identite_genre: "Mme",
      champ_GENRE: "Féminin",
      champ_NAISSANCE: "1985-04-02",
      champ_CAISSE: "CAF",
      champ_CAISSE_ENFANTS: "CAF",
      champ_ENFANTS: [
        {
          champ_E_NOM: "QUISTANE",
          champ_E_PRENOM: "Élyra",
          champ_E_NAISSANCE: "2015-03-12",
          champ_E_GENRE: "Féminin",
          champ_E_AEEH: "false",
        },
        {
          champ_E_NOM: "QUISTANE",
          champ_E_PRENOM: "Tozal",
          champ_E_NAISSANCE: "2012-05-04",
          champ_E_GENRE: "Masculin",
          champ_E_AEEH: "false",
        },
      ],
      champ_ENFANTS_OUI: "true",
      champ_FOYER_QF: "false",
      champ_ENFANTS_AEEH: "false",
    });
    expect(filled).toEqual([
      "allocataireGenre",
      "dateNaissance",
      "caisse",
      "caisseEnfants",
      "enfants",
      "aDesEnfants",
      "foyerQf",
      "enfantsAeeh",
    ]);
  });

  it("leaves out the children the last run already found eligible", () => {
    const lastRun = [{ ...refusedChild(ELYRA, "2015-03-12"), verdict: "eligible_pending" }, ...LAST_RUN.slice(1)];

    const rows = build([qf([ELYRA, TOZAL]), aeeh(0, null), aeeh(1, null)], lastRun).body
      .champ_ENFANTS as Record<string, string>[];

    expect(rows.map((row) => row.champ_E_PRENOM)).toEqual(["Tozal"]);
  });

  it("answers the foyer question yes on any campaign month under the threshold", () => {
    // The relance swept on after the month that opened the right.
    const { body } = build([qf([DORVAT], 650), qf([DORVAT], 900)]);

    expect(body.champ_FOYER_QF).toBe("true");
  });

  it("answers the AEEH question yes when a child of the foyer has the AEEH", () => {
    // Tozal is already eligible through the AEEH, so only Élyra is contested.
    const lastRun = [
      refusedChild(ELYRA, "2015-03-12"),
      { ...refusedChild(TOZAL, "2012-05-04"), verdict: "eligible_pending" },
    ];

    const { body } = build([qf([ELYRA, TOZAL]), aeeh(0, null), aeeh(1, "allocataire")], lastRun);

    expect(body.champ_ENFANTS_AEEH).toBe("true");
    expect(body.champ_FOYER_QF).toBe("false");
  });

  it("does not answer for a child the AEEH said nothing about", () => {
    const { body } = build([qf([ELYRA])]);

    expect(body.champ_ENFANTS).toEqual([
      {
        champ_E_NOM: "QUISTANE",
        champ_E_PRENOM: "Élyra",
        champ_E_NAISSANCE: "2015-03-12",
        champ_E_GENRE: "Féminin",
      },
    ]);
    expect(body.champ_ENFANTS_AEEH).toBeUndefined();
  });

  it("answers no children when the quotient lists none", () => {
    const { body } = build([qf([])], []);

    expect(body.champ_ENFANTS_OUI).toBe("false");
    expect(body.champ_ENFANTS).toBeUndefined();
    expect(body.champ_FOYER_QF).toBe("false");
  });

  it("leaves the children question open when none of them is contested", () => {
    const { body } = build([qf([DORVAT])]);

    expect(body.champ_ENFANTS_OUI).toBeUndefined();
    expect(body.champ_ENFANTS).toBeUndefined();
  });

  it("pre-fills nothing about the foyer without a quotient answer", () => {
    const { body } = build([]);

    expect(Object.keys(body)).toEqual([
      "identite_nom",
      "identite_prenom",
      "identite_genre",
      "champ_GENRE",
      "champ_NAISSANCE",
    ]);
  });

  it("pre-fills nothing about a foyer that names the user as one of its children", () => {
    const pivotAsChild = {
      nom_naissance: "OSTRENYA",
      prenoms: "Velmorak",
      date_naissance: "02/04/1985",
      sexe: "F",
    };
    const { body } = build([qf([pivotAsChild, ELYRA], 650, { allocataires: [] })]);

    expect(body.champ_CAISSE).toBeUndefined();
    expect(body.champ_CAISSE_ENFANTS).toBeUndefined();
    expect(body.champ_ENFANTS).toBeUndefined();
    expect(body.champ_FOYER_QF).toBeUndefined();
  });

  it("names the applicant's own aid and INE when their own row was refused", () => {
    const results = [
      self({ est_beneficiaire: true }, "dss.allocation_adulte_handicape_identite"),
      self({ ine: "1234567890A", statut_boursier: { est_boursier: false } }, "cnous.etudiant_boursier_identite"),
    ];
    const lastRun: LastRunRow[] = [
      { source: "self", familyName: null, givenName: null, birthdate: null, verdict: "not_eligible" },
    ];

    const { body } = build(results, lastRun);

    expect(body.champ_BENEF).toBe("AAH");
    expect(body.champ_INE).toBe("1234567890A");
  });

  it("keeps the applicant's own aid out when their own row is eligible", () => {
    const results = [
      self({ ine: "1234567890A", statut_boursier: { est_boursier: true } }, "cnous.etudiant_boursier_identite"),
    ];
    const lastRun: LastRunRow[] = [
      { source: "self", familyName: null, givenName: null, birthdate: null, verdict: "eligible_pending" },
      refusedChild(ELYRA, "2015-03-12"),
    ];

    const { body } = build(results, lastRun);

    expect(body.champ_BENEF).toBeUndefined();
    expect(body.champ_INE).toBeUndefined();
  });

  it("sends nothing for a champ or an answer the démarche does not configure", () => {
    const { body } = buildPrefill(
      { identity: IDENTITY, results: [qf([])], lastRun: [] },
      { caisse: { id: "CAISSE", values: { MSA: "MSA" } } },
    );

    expect(body).toEqual({
      identite_nom: "OSTRENYA",
      identite_prenom: "Velmorak",
      identite_genre: "Mme",
    });
  });
});
