import { InputState } from './form';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';

// Form step, search being the first step & confirm being the final step
export type FormStep = 'search' | 'confirm';

/**
 * Every field the two-step form can render, all branches confounded. Each step-two form
 * picks the subset LCA reads for its situation + organisme.
 */
export interface EligibilityFormInputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  recipientResidencePlace: InputState;
  recipientLastname: InputState;
  recipientFirstname: InputState;
  recipientCafNumber: InputState;
  recipientIneNumber: InputState;
  recipientBirthDate: InputState;
  recipientBirthCountry: InputState;
  recipientBirthPlace: InputState;
  recipientEmail: InputState;
}

export type EligibilityFieldName = keyof EligibilityFormInputsState;

export type BirthInputsState = Pick<
  EligibilityFormInputsState,
  'recipientBirthCountry' | 'recipientBirthPlace'
>;

export type StepOneFormInputsState = Pick<
  EligibilityFormInputsState,
  'beneficiaryLastname' | 'beneficiaryFirstname' | 'recipientResidencePlace'
>;

export type StepOneFields = Record<keyof StepOneFormInputsState, string>;

export type YoungCafInputsState = Pick<
  EligibilityFormInputsState,
  'recipientCafNumber' | 'recipientLastname' | 'recipientFirstname'
>;

export type YoungMsaInputsState = Pick<
  EligibilityFormInputsState,
  'recipientLastname' | 'recipientFirstname' | 'recipientBirthDate' | 'recipientBirthCountry'
> &
  Partial<Pick<EligibilityFormInputsState, 'recipientBirthPlace'>>;

export type AahCafInputsState = Pick<EligibilityFormInputsState, 'recipientCafNumber'>;

export type AahMsaInputsState = Pick<EligibilityFormInputsState, 'recipientBirthCountry'> &
  Partial<Pick<EligibilityFormInputsState, 'recipientBirthPlace'>>;

/* A boursier gives an INE, or the pays et commune de naissance that stand in for it */
export type CrousInputsState = Partial<
  Pick<
    EligibilityFormInputsState,
    'recipientIneNumber' | 'recipientBirthCountry' | 'recipientBirthPlace'
  >
>;

export const LCA_SITUATION = { JEUNE: 'jeune', AAH: 'AAH', BOURSIER: 'boursier' } as const;

export type SituationType = (typeof LCA_SITUATION)[keyof typeof LCA_SITUATION];

export const ORGANISME = { MSA: 'MSA', CAF: 'CAF', CNOUS: 'cnous' } as const;

export type OrganismType = (typeof ORGANISME)[keyof typeof ORGANISME];

export interface SearchResponseBodyItem {
  id: number;
  nom: string;
  prenom: string;
  date_naissance: string;
  situation: SituationType;
  organisme: OrganismType;
  matricule: string;
  hasMatricule: boolean;
}

export type SearchResponseBody = SearchResponseBodyItem[];

export interface SearchResponseErrorBody {
  message: string;
}

export interface ConfirmResponseBodyItem {
  adresse: {
    voie: string;
    code_postal: string;
    commune: string;
    nom_adresse_postale: string;
    code_insee: string;
  };
  allocataire: {
    qualite: string;
    nom: string;
    prenom: string;
    courriel: string;
    matricule: string;
    code_organisme: string;
    telephone: string;
    commune_naissance: string;
    code_insee_commune_naissance: string;
    date_naissance: string;
  };

  id: number;
  genre: 'F' | 'M';
  nom: string;
  prenom: string;
  nom_complet: string;
  date_naissance: string;
  situation: string;
  organisme: string;

  exercice_id: number;
  id_psp: string;

  a_valider: boolean;
  refuser: boolean;

  updated_at: string;
  created_at: string;
  uuid_doc: unknown;

  pdf_base_64: string;
}

export type ConfirmResponseBody = ConfirmResponseBodyItem[];

export interface EnhancedConfirmResponseBodyItem extends ConfirmResponseBodyItem {}

export type EnhancedConfirmResponseBody = EnhancedConfirmResponseBodyItem[];

export interface ConfirmResponseErrorBody {
  message: string;
}

export interface ConfirmPayload {
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
}

export interface SearchPayload {
  beneficiaryLastname: string;
  beneficiaryFirstname: string;
  beneficiaryBirthDate: string;
  recipientResidencePlace: string;
  allowanceName?: ALLOWANCE;
  isFromCrous?: boolean;
}

/** Everything the two steps collected, sent in one go once step 2 is filled in. */
export interface EligibilityTestRequest {
  allowanceName: ALLOWANCE;
  caisse: CAISSE | null;
  beneficiaryLastname: string;
  beneficiaryFirstname: string;
  beneficiaryBirthDate: string;
  recipientResidencePlace: string;
  // Collected at the very end of step two. Never sent to LCA: the only consumer is the
  // worker, which mails the outcome there.
  recipientEmail: string;
  recipientLastname?: string;
  recipientFirstname?: string;
  recipientCafNumber?: string;
  recipientIneNumber?: string;
  recipientBirthDate?: string;
  recipientBirthCountry?: string;
  recipientBirthPlace?: string;
}

/**
 * What the browser gets back from the single round-trip: whether the request was processed,
 * and nothing else.
 *
 * 'sent' covers a confirmed beneficiary and an unknown one alike. Telling them apart was the
 * last piece of the enumeration oracle: anyone could type a name, a birthdate and a commune
 * and read the answer off the network tab. The outcome, the code and the attestation now only
 * ever reach the mailbox the usager declared.
 *
 * 'error' means nothing was concluded and nothing was mailed — the usager is asked to retry.
 */
export type VerdictResponseBody = { outcome: 'sent' } | { outcome: 'error' };
