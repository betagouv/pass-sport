// LCA (Le Compte Asso / Gravitee) contract.

import type { Allowance } from "../eligibility/types";

export type SituationType = "jeune" | "AAH" | "boursier";
export type OrganismType = "MSA" | "CAF" | "cnous";

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

export type LcaError = { message: string };

// A person the LCA search can target (self or a QF child).
export type BeneficiaryCandidate = {
  source: "self" | "enfant";
  lastname: string;
  firstname: string;
  birthdate: string; // YYYY-MM-DD
  eligibilities: Allowance[];
  reasons: string[];
};

export type CandidateResult = {
  candidate: BeneficiaryCandidate;
  status: "confirmed" | "not_found" | "error";
  passSportCode?: string;
  confirm?: ConfirmItem; // sanitized (matricule stripped)
};
