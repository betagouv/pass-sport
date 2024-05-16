type InputState = 'default' | 'success' | 'error';

export interface StepOneFormInputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  beneficiaryBirthDate: InputState;
  recipientResidencePlace: InputState;
}

export interface YoungCafInputsState {
  // recipientBirthPlace: { state: InputState; errorMsg?: string };
  // recipientBirthCountry: { state: InputState; errorMsg?: string };
  recipientCafNumber: { state: InputState; errorMsg?: string };
  recipientLastname: { state: InputState; errorMsg?: string };
  recipientFirstname: { state: InputState; errorMsg?: string };
}

export interface YoungMsaInputsState {
  recipientLastname: { state: InputState; errorMsg?: string };
  recipientFirstname: { state: InputState; errorMsg?: string };
  recipientBirthDate: { state: InputState; errorMsg?: string };
  recipientBirthPlace: { state: InputState; errorMsg?: string };
  recipientBirthCountry: { state: InputState; errorMsg?: string };
}

export interface AahCafInputsState {
  recipientCafNumber: { state: InputState; errorMsg?: string };
}

export interface AahMsaInputsState {
  recipientBirthPlace: { state: InputState; errorMsg?: string };
  recipientBirthCountry: { state: InputState; errorMsg?: string };
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
  };

  id: number;
  genre: string;
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

export interface ConfirmResponseError {
  message: string;
}
