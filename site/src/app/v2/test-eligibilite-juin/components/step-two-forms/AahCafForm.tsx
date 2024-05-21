import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { FormEvent, useRef, useState } from 'react';
import {
  AahCafInputsState,
  ConfirmResponseBody,
  ConfirmResponseError,
  SearchResponseBodyItem,
} from 'types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import Alert from '@codegouvfr/react-dsfr/Alert';
import FormButton from './FormButton';

const initialInputsState: AahCafInputsState = {
  recipientCafNumber: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataRecieved: (data: ConfirmResponseBody) => void;
}

const AahCafForm = ({ eligibilityDataItem, onDataRecieved }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<AahCafInputsState>(initialInputsState);
  const [error, setError] = useState<string | null>();
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);

  const isFormValid = (formData: FormData): { isValid: boolean; states: AahCafInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof AahCafInputsState)[];

    const states = { ...initialInputsState };

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName);

      if (!value) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
      } else {
        if (typeof value === 'string') {
          if (fieldName === 'recipientCafNumber') {
            if (value.length !== 7) {
              states[fieldName] = {
                state: 'error',
                errorMsg: 'Le numéro CAF doit être composé de 7 chiffres',
              };

              isValid = false;
            }
          }
        }
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

    params.append('matricule', formData.get('recipientCafNumber') as string);
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
        setIsFormDisabled(true);
      }
    });
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label="Numéro de l’allocataire CAF*"
          // hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{
            name: 'recipientCafNumber',
            placeholder: 'ex: 0000000',
            type: 'number',
          }}
          state={inputStates.recipientCafNumber.state}
          stateRelatedMessage={inputStates.recipientCafNumber.errorMsg}
          disabled={isFormDisabled}
        />

        <FormButton isDisabled={isFormDisabled} />
      </form>

      {error && (
        <Alert
          //   className={styles.error}
          severity="error"
          //   isClosed={!isError}
          onClose={() => setError(null)}
          title={error}
          //   description="Veuillez réessayer plus tard"
          closable
        />
      )}
    </div>
  );
};

export default AahCafForm;
