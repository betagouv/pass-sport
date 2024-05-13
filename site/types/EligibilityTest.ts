type InputState = 'default' | 'success' | 'error';

export interface InputsState {
  beneficiaryLastname: InputState;
  beneficiaryFirstname: InputState;
  beneficiaryBirthDate: InputState;
  recipientResidencePlace: InputState;
}

export interface SearchResponseBody {
  id: number;
  nom: string;
  prenom: string;
  date_naissance: string;
  situation: string;
  organisme: string;
  matricule: string;
}

export interface SearchResponseError {
  message: string;
}
