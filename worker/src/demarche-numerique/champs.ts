// Prefill ids of the support démarche's champs, per démarche number. Written and checked by
// `pnpm dn:champs` (scripts/dn-champs.ts), never by hand: DN silently drops a value sent under an
// unknown id or outside a champ's options. Their labels are the ones
// data/2026/dn-pipeline/mapping.py reads submitted dossiers by.

export type DnChamp = { id: string };

// What the prefill sends for each answer: an option label for a drop-down, "true"/"false" for
// a yes/no, "M."/"Mme" for a civilité.
export type DnChoiceChamp<K extends string> = DnChamp & { values: Partial<Record<K, string>> };

export type DnGender = "male" | "female";
export type DnYesNo = "yes" | "no";
export type DnAide = "aah" | "bourse";
export type DnCaisse = "CAF" | "MSA";

export type DnEnfantChamps = {
  aeeh?: DnChoiceChamp<DnYesNo>;
  genre?: DnChoiceChamp<DnGender>;
  prenom?: DnChamp;
  nom?: DnChamp;
  dateNaissance?: DnChamp;
};

// Every champ is optional: one left out is simply not pre-filled.
export type DnChamps = {
  allocataireGenre?: DnChoiceChamp<DnGender>;
  beneficiaireDe?: DnChoiceChamp<DnAide>;
  ine?: DnChamp;
  caisse?: DnChoiceChamp<DnCaisse>;
  dateNaissance?: DnChamp;
  aDesEnfants?: DnChoiceChamp<DnYesNo>;
  caisseEnfants?: DnChoiceChamp<DnCaisse>;
  foyerQf?: DnChoiceChamp<DnYesNo>;
  enfantsAeeh?: DnChoiceChamp<DnYesNo>;
  enfants?: DnChamp & { champs: DnEnfantChamps };
};

const YES_NO = { yes: "true", no: "false" };
const CIVILITE = { male: "M.", female: "Mme" };
const CAISSES = { CAF: "CAF", MSA: "MSA" };

export const CHAMPS_BY_DEMARCHE: Record<number, DnChamps> = {
  // « Demande de code pass Sport 2026 », production and staging alike.
  159278: {
    allocataireGenre: { id: "Q2hhbXAtNzA4ODEzNg==", values: CIVILITE },
    beneficiaireDe: {
      id: "Q2hhbXAtNzA3OTkwNg==",
      values: {
        aah: "L'Allocation aux adultes handicapés (AAH)",
        bourse:
          "Bénéficiaire d'une bourse du CROUS ou d'une bourse régionale pour une formation sanitaire et sociale",
      },
    },
    ine: { id: "Q2hhbXAtNzA4MjEwMw==" },
    caisse: { id: "Q2hhbXAtNzA4NzgxMQ==", values: CAISSES },
    dateNaissance: { id: "Q2hhbXAtNzA4ODY3Nw==" },
    aDesEnfants: { id: "Q2hhbXAtNzA4MjEyOA==", values: YES_NO },
    caisseEnfants: { id: "Q2hhbXAtNzEyNDA5Nw==", values: CAISSES },
    foyerQf: { id: "Q2hhbXAtNzA4NzM1MQ==", values: YES_NO },
    enfantsAeeh: { id: "Q2hhbXAtNzEyMzU3Nw==", values: YES_NO },
    enfants: {
      id: "Q2hhbXAtNzA3Nzk2Mw==",
      champs: {
        aeeh: { id: "Q2hhbXAtNzA4MjEzMg==", values: YES_NO },
        genre: { id: "Q2hhbXAtNzA3Nzk5MA==", values: CIVILITE },
        prenom: { id: "Q2hhbXAtNzA3Nzk5Mw==" },
        nom: { id: "Q2hhbXAtNzA3Nzk5NQ==" },
        dateNaissance: { id: "Q2hhbXAtNzA3ODA5Mg==" },
      },
    },
  },
};
