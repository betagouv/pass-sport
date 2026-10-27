import type {
  DnAide,
  DnCaisse,
  DnChamp,
  DnChamps,
  DnChoiceChamp,
  DnEnfantChamps,
  DnGender,
  DnYesNo,
} from "./champs";

// Turns the démarche's descriptors (DN GraphQL, Revision.champDescriptors) into the ids and
// values champs.ts holds. Only scripts/dn-champs.ts runs it: the worker carries no DN token.

export type ChampDescriptor = {
  __typename: string;
  id: string;
  label: string;
  options?: string[] | null;
  champDescriptors?: ChampDescriptor[] | null;
};

// The champs of data/2026/dn-pipeline/mapping.py DN_CHAMPS and DN_ENFANT_CHAMPS the worker
// pre-fills: the address is not one, no API answer carries it. Change them together.
export const DN_CHAMP_LABELS = {
  allocataireGenre: "Votre civilité :",
  beneficiaireDe: "Je suis bénéficiaire de :",
  ine: "Numéro INE (Identification Nationale Étudiant)",
  caisse: "À quelle caisse êtes vous rattaché ?",
  dateNaissance: "Votre date de naissance",
  aDesEnfants: "Est ce qu'un ou plusieurs de vos enfants sont éligibles au Pass Sport ?",
  caisseEnfants: "A quelle caisse sont ils rattachés ?",
  foyerQf:
    "Font ils partie d'un foyer dont le quotient familial est inférieur ou égal à 699 € ?",
  enfantsAeeh:
    "Un ou plusieurs de vos enfants sont-ils bénéficiaires de l'AEEH (Allocation d'éducation " +
    "de l'enfant handicapé) ?",
  enfants: "Pour chaque enfant, merci de remplir les champs suivants :",
} as const;

export const DN_ENFANT_CHAMP_LABELS = {
  aeeh: "Est il bénéficiaire de l'AEEH (Allocation d'éducation de l'enfant handicapé)",
  genre: "Genre de l'enfant",
  prenom: "Prénom de l'enfant",
  nom: "Nom de l'enfant",
  dateNaissance: "Date de naissance de l'enfant",
} as const;

// mapping.fold: no accents, no case, single spaces; the typographic apostrophe first, which the
// ASCII folding would drop.
export const fold = (value: string): string =>
  value
    .replace(/’/g, "'")
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

// mapping.SITUATION_WORDS, ORGANISME_BY_CAISSE_WORDS, GENRE_BY_LABEL, YES and NO: what the
// pipeline reads the submitted answers with.
export const SITUATION_WORDS = {
  AAH: ["aah", "adultes handicapes"],
  AEEH: ["aeeh", "education de l'enfant handicape"],
  jeune: ["quotient familial", "qf", "ars"],
  boursier: ["bourse", "boursier", "boursiere", "crous", "cnous"],
} as const;

const ORGANISME_WORDS = {
  CAF: ["caf", "allocations familiales"],
  MSA: ["msa", "mutualite sociale agricole"],
} as const;

export const GENRE_BY_LABEL: Record<string, "M" | "F"> = {
  m: "M",
  "m.": "M",
  monsieur: "M",
  masculin: "M",
  garcon: "M",
  homme: "M",
  f: "F",
  mme: "F",
  "mme.": "F",
  madame: "F",
  feminin: "F",
  fille: "F",
  femme: "F",
};

const YES = new Set(["oui", "true", "yes"]);
const NO = new Set(["non", "false", "no"]);

const escapeRegExp = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// mapping._named: the one value whose words appear whole in the text, null when none or several.
export const named = <K extends string>(
  value: string,
  wordsByValue: Record<K, readonly string[]>,
): K | null => {
  const folded = fold(value);
  const found = (Object.keys(wordsByValue) as K[]).filter((key) =>
    wordsByValue[key].some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(folded)),
  );
  return found.length === 1 ? found[0] : null;
};

const TEXT_TYPES = ["TextChampDescriptor", "TextareaChampDescriptor"];

// The option each answer maps to, from the labels a drop-down offers.
const pickOptions = <K extends string>(
  options: string[],
  answers: readonly K[],
  read: (option: string) => K | null,
): { values: Partial<Record<K, string>>; missing: K[] } => {
  const values: Partial<Record<K, string>> = {};
  const missing: K[] = [];

  for (const answer of answers) {
    const matching = options.filter((option) => read(option) === answer);
    if (matching.length === 1) values[answer] = matching[0];
    else missing.push(answer);
  }

  return { values, missing };
};

type Resolved<T> = { champ?: T; problem?: string };

const plain = (descriptor: ChampDescriptor, accepted: string[]): Resolved<DnChamp> =>
  accepted.includes(descriptor.__typename)
    ? { champ: { id: descriptor.id } }
    : { problem: `type ${descriptor.__typename} non pris en charge` };

const choiceOf = <K extends string>(
  descriptor: ChampDescriptor,
  answers: readonly K[],
  fixed: Partial<Record<string, Record<K, string>>>,
  read: (option: string) => K | null,
): Resolved<DnChoiceChamp<K>> => {
  const values = fixed[descriptor.__typename];
  if (values) return { champ: { id: descriptor.id, values } };

  if (descriptor.__typename !== "DropDownListChampDescriptor") {
    return { problem: `type ${descriptor.__typename} non pris en charge` };
  }

  const picked = pickOptions(descriptor.options ?? [], answers, read);
  return {
    champ: { id: descriptor.id, values: picked.values },
    problem:
      picked.missing.length > 0
        ? `aucune option unique pour ${picked.missing.join(", ")} parmi ${JSON.stringify(descriptor.options ?? [])}`
        : undefined,
  };
};

const GENDERS: readonly DnGender[] = ["male", "female"];
const readGender = (option: string): DnGender | null => {
  const genre = GENRE_BY_LABEL[fold(option)];
  return genre === "M" ? "male" : genre === "F" ? "female" : null;
};
const CIVILITE = { male: "M.", female: "Mme" };

const gender = (descriptor: ChampDescriptor) =>
  choiceOf(
    descriptor,
    GENDERS,
    { CiviliteChampDescriptor: CIVILITE, TextChampDescriptor: CIVILITE },
    readGender,
  );

const YES_NO: readonly DnYesNo[] = ["yes", "no"];
const readYesNo = (option: string): DnYesNo | null =>
  YES.has(fold(option)) ? "yes" : NO.has(fold(option)) ? "no" : null;
const BOOLEAN = { yes: "true", no: "false" };

const yesNo = (descriptor: ChampDescriptor) =>
  choiceOf(
    descriptor,
    YES_NO,
    { YesNoChampDescriptor: BOOLEAN, CheckboxChampDescriptor: BOOLEAN },
    readYesNo,
  );

const AIDES: readonly DnAide[] = ["aah", "bourse"];
const readAide = (option: string): DnAide | null => {
  const situation = named(option, SITUATION_WORDS);
  return situation === "AAH" ? "aah" : situation === "boursier" ? "bourse" : null;
};

const aide = (descriptor: ChampDescriptor) =>
  choiceOf(descriptor, AIDES, { TextChampDescriptor: { aah: "AAH", bourse: "Bourse" } }, readAide);

const CAISSES: readonly DnCaisse[] = ["CAF", "MSA"];

const caisse = (descriptor: ChampDescriptor) =>
  choiceOf(descriptor, CAISSES, { TextChampDescriptor: { CAF: "CAF", MSA: "MSA" } }, (option) =>
    named(option, ORGANISME_WORDS),
  );

const date = (descriptor: ChampDescriptor) => plain(descriptor, ["DateChampDescriptor"]);
const textual = (descriptor: ChampDescriptor) => plain(descriptor, TEXT_TYPES);

type Resolver = (descriptor: ChampDescriptor) => Resolved<unknown>;

const MAIN_RESOLVERS: Record<Exclude<keyof DnChamps, "enfants">, Resolver> = {
  allocataireGenre: gender,
  beneficiaireDe: aide,
  ine: textual,
  caisse,
  dateNaissance: date,
  aDesEnfants: yesNo,
  caisseEnfants: caisse,
  foyerQf: yesNo,
  enfantsAeeh: yesNo,
};

const ENFANT_RESOLVERS: Record<keyof DnEnfantChamps, Resolver> = {
  aeeh: yesNo,
  genre: gender,
  prenom: textual,
  nom: textual,
  dateNaissance: date,
};

const byLabel = (descriptors: ChampDescriptor[], label: string): ChampDescriptor | string => {
  const matching = descriptors.filter((d) => fold(d.label) === fold(label));
  if (matching.length === 1) return matching[0];
  return matching.length === 0 ? "absent de la démarche" : `${matching.length} champs portent ce libellé`;
};

const resolveAll = <T extends object>(
  descriptors: ChampDescriptor[],
  labels: Record<string, string>,
  resolvers: Record<string, Resolver>,
  scope: string,
  problems: string[],
): T => {
  const champs: Record<string, unknown> = {};

  for (const [key, resolve] of Object.entries(resolvers)) {
    const found = byLabel(descriptors, labels[key]);
    if (typeof found === "string") {
      problems.push(`${scope}${key} « ${labels[key]} » : ${found}`);
      continue;
    }

    const { champ, problem } = resolve(found);
    if (champ) champs[key] = champ;
    if (problem) problems.push(`${scope}${key} « ${labels[key]} » : ${problem}`);
  }

  return champs as T;
};

export const resolveChamps = (
  descriptors: ChampDescriptor[],
): { champs: DnChamps; problems: string[] } => {
  const problems: string[] = [];
  const champs = resolveAll<DnChamps>(
    descriptors,
    DN_CHAMP_LABELS,
    MAIN_RESOLVERS,
    "",
    problems,
  );

  const enfants = byLabel(descriptors, DN_CHAMP_LABELS.enfants);
  if (typeof enfants === "string") {
    problems.push(`enfants « ${DN_CHAMP_LABELS.enfants} » : ${enfants}`);
  } else if (enfants.__typename !== "RepetitionChampDescriptor") {
    problems.push(`enfants « ${DN_CHAMP_LABELS.enfants} » : type ${enfants.__typename} non pris en charge`);
  } else {
    champs.enfants = {
      id: enfants.id,
      champs: resolveAll<DnEnfantChamps>(
        enfants.champDescriptors ?? [],
        DN_ENFANT_CHAMP_LABELS,
        ENFANT_RESOLVERS,
        "enfants.",
        problems,
      ),
    };
  }

  return { champs, problems };
};
