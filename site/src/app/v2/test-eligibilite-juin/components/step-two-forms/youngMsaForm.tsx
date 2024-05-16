import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { FormEvent, useRef, useState } from 'react';
import {
  ConfirmResponseBody,
  ConfirmResponseError,
  SearchResponseBodyItem,
  YoungMsaInputsState,
} from 'types/EligibilityTest';
import { convertDate, mapper } from './helper';

const initialInputsState: YoungMsaInputsState = {
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataRecieved: (data: ConfirmResponseBody) => void;
}

const YoungMsaForm = ({ eligibilityDataItem, onDataRecieved }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<YoungMsaInputsState>(initialInputsState);
  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: YoungMsaInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof YoungMsaInputsState)[];

    const states = { ...initialInputsState };

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName);

      if (!value) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const requestPassSportCode = (): Promise<{ status: number; body: unknown }> => {
    const domain = process.env.NEXT_PUBLIC_LCA_API_URL;

    if (!domain) {
      throw new Error('Error: NEXT_PUBLIC_LCA_API_URL is not set');
    }

    const baseUrl = `${domain}/gw/psp-server/beneficiaires/confirm`;
    const params = new URLSearchParams();

    const formData = new FormData(formRef.current!);
    const formattedRecipientBirthDate =
      convertDate(formData.get('recipientBirthDate') as string) ?? '';

    params.append('allocataireName', formData.get('recipientLastname') as string);
    params.append('allocataireSurname', formData.get('recipientFirstname') as string);
    params.append('allocataireBirthDate', formattedRecipientBirthDate);
    params.append('codeInseeBirth', formData.get('recipientBirthPlace') as string);

    params.append('id', eligibilityDataItem.id.toString());
    params.append('situation', eligibilityDataItem.situation);
    params.append('organisme', eligibilityDataItem.organisme);

    const url = new URL(baseUrl);
    url.search = params.toString();
    return fetch(url).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as unknown,
    }));
  };

  const notifyError = (status: number, body: ConfirmResponseError) => {
    setError('Une erreur a eu lieu. Merci de rééessayer plus tard');
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates({ ...states });

    if (!isValid) {
      return;
    }

    await requestPassSportCode().then(({ status, body }: { body: unknown; status: number }) => {
      if (status !== 200) {
        notifyError(status, body as ConfirmResponseError);
      } else {
        onDataRecieved(body as ConfirmResponseBody);
      }
    });
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label="Nom de l’allocataire*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{
            name: 'recipientLastname',
            placeholder: 'ex: Dupont',
          }}
          state={inputStates.recipientLastname.state}
          stateRelatedMessage={inputStates.recipientLastname.errorMsg}
        />

        <Input
          label="Prénom de l’allocataire*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: 'recipientFirstname', placeholder: 'ex: Marie' }}
          state={inputStates.recipientFirstname.state}
          stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
        />

        <Input
          label="Date de naissance de l’allocataire*"
          hintText="Format attendu JJ/MM/AAAA"
          nativeInputProps={{ name: 'recipientBirthDate', type: 'date', placeholder: 'ex: Marie' }}
          state={inputStates.recipientBirthDate.state}
          stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
        />

        <Input
          label="Commune de naissance de l’allocataire*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: 'recipientBirthPlace' }}
          state={inputStates.recipientBirthPlace.state}
          stateRelatedMessage={inputStates.recipientBirthPlace.errorMsg}
        />

        <Input
          label="Pays de naissance de l’allocataire*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: 'recipientBirthCountry' }}
          state={inputStates.recipientBirthCountry.state}
          stateRelatedMessage={inputStates.recipientBirthCountry.errorMsg}
        />

        <Button priority="primary" iconId="fr-icon-arrow-right-line" iconPosition="right">
          Je vérifie mon éligibilité
        </Button>
      </form>
    </div>
  );
};

export default YoungMsaForm;
