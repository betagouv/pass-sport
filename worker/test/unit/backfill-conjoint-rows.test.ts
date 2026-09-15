import { describe, expect, it } from "vitest";
import { conjointUpdatesFromRows } from "../../src/scripts/backfill-conjoint-rows";

// Ce que le passage qf-batch de rattrapage écrit pour un foyer : l'entrée recopiée, plus les
// colonnes qf_*. Identités fictives, syllabiques : les fixtures ne doivent jamais ressembler
// à un vrai bénéficiaire.
const COUPLE = JSON.stringify([
  {
    nom_naissance: "OSTRENYA",
    nom_usage: "KEDOSAVERIL",
    prenoms: "Velmorak",
    date_naissance: "14/03/1990",
    sexe: "F",
  },
  { nom_naissance: "VOKTARIMENDO", prenoms: "Tarnu", date_naissance: "17/11/1982", sexe: "M" },
]);

const row = (overrides: Record<string, string> = {}) => ({
  allocataire_fc_sub: "sub-A",
  "allocataire-nom_naissance": "OSTRENYA",
  "allocataire-date_naissance": "1990-03-14",
  qf_status: "trouve",
  qf_allocataires: COUPLE,
  ...overrides,
});

describe("conjointUpdatesFromRows", () => {
  it("retient l'autre allocataire, au vocabulaire pivot", () => {
    expect(conjointUpdatesFromRows([row()])).toEqual([
      {
        sub: "sub-A",
        conjoint: {
          family_name: "VOKTARIMENDO",
          preferred_username: undefined,
          given_name: "Tarnu",
          birthdate: "1982-11-17",
          gender: "male",
        },
      },
    ]);
  });

  it("ne produit rien quand la réponse ne désigne aucun conjoint", () => {
    const seul = JSON.stringify([
      { nom_naissance: "OSTRENYA", date_naissance: "14/03/1990", sexe: "F" },
    ]);
    // Couple ambigu : aucune des deux entrées ne porte la date de naissance du pivot, et
    // désigner le connecté serait une devinette.
    const ambigu = JSON.stringify([
      { nom_naissance: "ZELVIK", date_naissance: "01/01/1900" },
      { nom_naissance: "OSVAREK", date_naissance: "02/02/1901" },
    ]);

    expect(conjointUpdatesFromRows([row({ qf_allocataires: seul })])).toEqual([]);
    expect(conjointUpdatesFromRows([row({ qf_allocataires: ambigu })])).toEqual([]);
    expect(conjointUpdatesFromRows([row({ qf_allocataires: "" })])).toEqual([]);
    expect(conjointUpdatesFromRows([row({ qf_allocataires: "{pas du json" })])).toEqual([]);
  });

  it("ne produit rien sans date de naissance pivot ni sans sub", () => {
    // Sans la date du pivot, impossible de dire laquelle des deux entrées est le connecté ;
    // sans sub, aucune clé pour écrire en base.
    expect(conjointUpdatesFromRows([row({ "allocataire-date_naissance": "" })])).toEqual([]);
    expect(conjointUpdatesFromRows([row({ allocataire_fc_sub: "" })])).toEqual([]);
  });

  it("ne rend qu'une mise à jour par foyer", () => {
    const updates = conjointUpdatesFromRows([row(), row(), row({ allocataire_fc_sub: "sub-B" })]);

    expect(updates.map((update) => update.sub)).toEqual(["sub-A", "sub-B"]);
  });
});
