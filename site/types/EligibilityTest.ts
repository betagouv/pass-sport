import { InputState } from './form';

// Form step, search being the first step & confirm being the final step
export type FormStep = 'search' | 'confirm';

export interface StepOneFormInputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  // beneficiaryBirthDate: InputState;
  recipientResidencePlace: InputState;
}

export interface YoungCafInputsState {
  recipientCafNumber: InputState;
  recipientLastname: InputState;
  recipientFirstname: InputState;
}

export interface CrousInputsState {
  recipientIneNumber?: InputState;
  recipientBirthCountry?: InputState;
  recipientBirthPlace?: InputState;
}

export interface YoungMsaInputsState {
  recipientLastname: InputState;
  recipientFirstname: InputState;
  recipientBirthDate: InputState;
  recipientBirthCountry: InputState;
  recipientBirthPlace?: InputState;
}

export interface AahCafInputsState {
  recipientCafNumber: InputState;
}

export interface AahMsaInputsState {
  recipientBirthCountry: InputState;
  recipientBirthPlace?: InputState;
}

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
  genre: string; // 'F', 'M', else ?
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
}

export type ConfirmResponseBody = ConfirmResponseBodyItem[];

export interface EnhancedConfirmResponseBodyItem extends ConfirmResponseBodyItem {
  qrcodeUrl: string;
}

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
  isFromCrous?: boolean;
}
