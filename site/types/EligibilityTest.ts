import { InputState } from './form';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

// Form step, search being the first step & confirm being the final step
export type FormStep = 'search' | 'confirm';

/**
 * Every field the merged form can render, all scenarios confounded. Which ones are displayed
 * depends on the allowance, and which ones are required is only known once /search has answered
 * with the caisse.
 */
export interface EligibilityFormInputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  recipientResidencePlace: InputState;
  recipientLastname: InputState;
  recipientFirstname: InputState;
  recipientGenre: InputState;
  recipientCafNumber: InputState;
  recipientIneNumber: InputState;
  recipientBirthDate: InputState;
  recipientBirthCountry: InputState;
  recipientBirthPlace: InputState;
}

export type EligibilityFieldName = keyof EligibilityFormInputsState;

export type BirthInputsState = Pick<
  EligibilityFormInputsState,
  'recipientBirthCountry' | 'recipientBirthPlace'
>;

export type SituationType = 'jeune' | 'AAH' | 'boursier';
export type OrganismType = 'MSA' | 'CAF' | 'cnous';

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
