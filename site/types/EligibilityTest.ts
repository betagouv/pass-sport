type DsfrInputState = 'default' | 'success' | 'error';

export interface InputState {
  state: DsfrInputState;
  errorMsg?: string;
}

export interface StepOneFormInputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  beneficiaryBirthDate: InputState;
  recipientResidencePlace: InputState;
}

export interface YoungCafInputsState {
  recipientCafNumber: InputState;
  recipientLastname: InputState;
  recipientFirstname: InputState;
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

export interface SearchResponseBodyItem {
  id: number;
  nom: string;
  prenom: string;
  date_naissance: string;
  situation: 'jeune' | 'AAH';
  organisme: 'MSA' | 'CAF';
  matricule: string;
}

export type SearchResponseBody = SearchResponseBodyItem[];

export interface SearchResponseError {
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

export interface ConfirmResponseError {
  message: string;
}
