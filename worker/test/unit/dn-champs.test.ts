import { describe, expect, it } from "vitest";
import { CHAMPS_BY_DEMARCHE, type DnChamps } from "../../src/demarche-numerique/champs";
import {
  DN_CHAMP_LABELS,
  DN_ENFANT_CHAMP_LABELS,
  GENRE_BY_LABEL,
  SITUATION_WORDS,
  fold,
  named,
  resolveChamps,
  type ChampDescriptor,
} from "../../src/demarche-numerique/champs-resolver";

const descriptor = (
  __typename: string,
  label: string,
  extra: Partial<ChampDescriptor> = {},
): ChampDescriptor => ({ __typename, id: `id-${fold(label).slice(0, 12)}`, label, ...extra });

// The démarche as its administrators could have built it: labels with other accents and cases
// than mapping.py's, every kind of champ the resolver knows.
const DESCRIPTORS: ChampDescriptor[] = [
  descriptor("HeaderSectionChampDescriptor", "Votre identité"),
  descriptor("CiviliteChampDescriptor", "Genre de l’allocataire"),
  descriptor("DateChampDescriptor", "VOTRE DATE DE NAISSANCE"),
  descriptor("AddressChampDescriptor", "Adresse de résidence"),
  descriptor("DropDownListChampDescriptor", "Bénéficiaire de", {
    options: [
      "L'Allocation aux adultes handicapés (AAH)",
      "Une bourse étudiante sur critères sociaux (CROUS)",
      "Aucune des deux",
    ],
  }),
  descriptor("TextChampDescriptor", "Numéro INE (Identification Nationale Étudiant)"),
  descriptor("YesNoChampDescriptor", DN_CHAMP_LABELS.foyerQfAeeh),
  descriptor("TextChampDescriptor", "À quelle caisse appartenez-vous ?"),
  descriptor("DropDownListChampDescriptor", "Avez-vous des enfants", { options: ["Oui", "Non"] }),
  descriptor("RepetitionChampDescriptor", "Enfants", {
    champDescriptors: [
      descriptor("YesNoChampDescriptor", DN_ENFANT_CHAMP_LABELS.aeeh),
      descriptor("DropDownListChampDescriptor", "Genre de l'enfant", {
        options: ["Fille", "Garçon"],
      }),
      descriptor("TextChampDescriptor", "Prénom de l'enfant"),
      descriptor("TextChampDescriptor", "Nom de l'enfant"),
      descriptor("DateChampDescriptor", "Date de naissance de l'enfant"),
    ],
  }),
];

describe("fold", () => {
  // Same output as mapping.fold, € and œ dropped like Python's ASCII folding.
  it.each([
    ["Genre de l’allocataire", "genre de l'allocataire"],
    ["  À QUELLE   caisse_appartenez-vous ?", "a quelle caisse appartenez-vous ?"],
    ["inférieur ou égal à 699 €", "inferieur ou egal a 699"],
    ["Lœtitia", "ltitia"],
  ])("folds %j", (value, folded) => {
    expect(fold(value)).toBe(folded);
  });
});

describe("resolveChamps", () => {
  it("resolves every champ the prefill uses", () => {
    const { champs, problems } = resolveChamps(DESCRIPTORS);

    expect(problems).toEqual([]);
    expect(champs.allocataireGenre?.values).toEqual({ male: "M.", female: "Mme" });
    expect(champs.beneficiaireDe?.values).toEqual({
      aah: "L'Allocation aux adultes handicapés (AAH)",
      bourse: "Une bourse étudiante sur critères sociaux (CROUS)",
    });
    expect(champs.foyerQfAeeh?.values).toEqual({ yes: "true", no: "false" });
    expect(champs.caisse?.values).toEqual({ CAF: "CAF", MSA: "MSA" });
    expect(champs.aDesEnfants?.values).toEqual({ yes: "Oui", no: "Non" });
    expect(champs.ine).toEqual({ id: DESCRIPTORS[5].id });
    expect(champs.enfants?.id).toBe(DESCRIPTORS[9].id);
    expect(champs.enfants?.champs.genre?.values).toEqual({ male: "Garçon", female: "Fille" });
    expect(Object.keys(champs.enfants?.champs ?? {}).sort()).toEqual([
      "aeeh",
      "dateNaissance",
      "genre",
      "nom",
      "prenom",
    ]);
  });

  it("names what it cannot resolve", () => {
    const { champs, problems } = resolveChamps([
      descriptor("TextChampDescriptor", "Bénéficiaire de"),
      descriptor("TextChampDescriptor", "Votre date de naissance"),
      descriptor("TextChampDescriptor", "Genre de l'allocataire"),
      descriptor("TextChampDescriptor", "Genre de l'allocataire"),
      descriptor("DropDownListChampDescriptor", "Avez-vous des enfants", { options: ["Peut-être"] }),
    ]);

    expect(champs.beneficiaireDe?.values).toEqual({ aah: "AAH", bourse: "Bourse" });
    expect(champs.dateNaissance).toBeUndefined();
    expect(champs.allocataireGenre).toBeUndefined();
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dateNaissance « Votre date de naissance » : type TextChampDescriptor"),
        expect.stringContaining("allocataireGenre « Genre de l'allocataire » : 2 champs"),
        expect.stringContaining("aDesEnfants « Avez-vous des enfants » : aucune option unique pour yes, no"),
        expect.stringContaining("ine « Numéro INE (Identification Nationale Étudiant) » : absent"),
        expect.stringContaining("enfants « Enfants » : absent"),
      ]),
    );
  });
});

// What the DN pipeline will read back from each pre-filled answer.
const GENRES = new Set([...Object.keys(GENRE_BY_LABEL), "m.", "mme"]);
const BOOLEANS = new Set(["oui", "non", "true", "false"]);

const checkConfigured = (champs: DnChamps) => {
  for (const value of Object.values(champs.allocataireGenre?.values ?? {})) {
    expect(GENRES.has(fold(value))).toBe(true);
  }
  for (const value of Object.values(champs.enfants?.champs.genre?.values ?? {})) {
    expect(GENRES.has(fold(value))).toBe(true);
  }
  for (const value of [
    ...Object.values(champs.foyerQfAeeh?.values ?? {}),
    ...Object.values(champs.aDesEnfants?.values ?? {}),
    ...Object.values(champs.enfants?.champs.aeeh?.values ?? {}),
  ]) {
    expect(BOOLEANS.has(fold(value))).toBe(true);
  }
  const { aah, bourse } = champs.beneficiaireDe?.values ?? {};
  if (aah) expect(named(aah, SITUATION_WORDS)).toBe("AAH");
  if (bourse) expect(named(bourse, SITUATION_WORDS)).toBe("boursier");
};

describe("CHAMPS_BY_DEMARCHE", () => {
  it("only holds answers the DN pipeline reads back as meant", () => {
    checkConfigured(resolveChamps(DESCRIPTORS).champs);
    for (const champs of Object.values(CHAMPS_BY_DEMARCHE)) checkConfigured(champs);
  });
});
