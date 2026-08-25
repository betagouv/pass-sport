// LCA (Le Compte Asso / Gravitee) contract.

import type { Allowance } from "../eligibility/types";

export const LCA_SITUATION = { JEUNE: "jeune", AAH: "AAH", BOURSIER: "boursier" } as const;

export type SituationType = (typeof LCA_SITUATION)[keyof typeof LCA_SITUATION];

export const ORGANISME = { MSA: "MSA", CAF: "CAF", CNOUS: "cnous" } as const;

export type OrganismType = (typeof ORGANISME)[keyof typeof ORGANISME];

export type SearchPayload = {
  beneficiaryLastname: string;
  beneficiaryFirstname: string;
  beneficiaryBirthDate: string;
  recipientResidencePlace: string; // INSEE code
  allowanceName?: Allowance;
  isFromCrous?: boolean;
};

export type SearchItem = {
  id: number;
  nom: string;
  prenom: string;
  date_naissance: string;
  situation: SituationType;
  organisme: OrganismType;
  matricule: string; // server-side only, stripped before storage
  hasMatricule: boolean;
};

export type ConfirmPayload = {
  id: string;
  situation: string;
  organisme: string;
  recipientLastname?: string;
  recipientFirstname?: string;
  recipientCafNumber?: string;
  recipientIneNumber?: string;
  recipientBirthPlace?: string;
  recipientBirthDate?: string;
  recipientBirthCountry?: string;
};

export type ConfirmItem = {
  id: number;
  id_psp: string; // the pass Sport code
  nom: string;
  prenom: string;
  nom_complet?: string;
  date_naissance: string;
  genre?: "F" | "M";
  situation: string;
  organisme: string;
  allocataire?: Record<string, unknown>;
  adresse?: Record<string, unknown>;
  pdf_base_64?: string;
  [key: string]: unknown;
};

// httpStatus is absent when LCA answers 200 with a business message, and set when the
// gateway answers non-2xx.
export type LcaError = { message: string; httpStatus?: number };

// A person the LCA search can target (self or a QF child).
export type BeneficiaryCandidate = {
  source: "self" | "enfant";
  lastname: string;
  firstname: string;
  birthdate: string; // YYYY-MM-DD
  // Only ever set for 'enfant' — derived from the QF response's own sexe field (see
  // candidates.ts). 'self' candidates leave this unset: the PDF route sources the
  // allocataire's gender from their FranceConnect session identity, not from here.
  gender?: "male" | "female";
  eligibilities: Allowance[];
  reasons: string[];
};

// 'confirmed' carries a code by construction: LCA answering an item without an id_psp is
// the same answer as answering nothing, and is reported as 'not_found'.
export type CandidateResult =
  | {
      candidate: BeneficiaryCandidate;
      status: "confirmed";
      passSportCode: string;
      confirm: ConfirmItem; // sanitized (matricule stripped)
    }
  | { candidate: BeneficiaryCandidate; status: "not_found" | "error" };
