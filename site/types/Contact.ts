import { InputState } from './form';

export interface InputsState {
  firstname: InputState;
  lastname: InputState;
  email: InputState;
  reason: InputState;
  message: InputState;
  consent: InputState;
  siret: InputState;
  rna: InputState;
}

export interface InputsStateBenef {
  firstname: InputState;
  lastname: InputState;
  email: InputState;
  reason: InputState;
  message: InputState;
  consent: InputState;
}
