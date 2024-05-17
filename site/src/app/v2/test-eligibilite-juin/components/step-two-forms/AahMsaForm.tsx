import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  AahMsaInputsState,
  ConfirmResponseBody,
  ConfirmResponseError,
  SearchResponseBodyItem,
} from 'types/EligibilityTest';
import { mapper } from './helper';
import FormButton from './FormButton';
import CommonMsaInputs from './common-msa-inputs/CommonMsaInputs';

const initialInputsState: AahMsaInputsState = {
  recipientBirthCountry: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataRecieved: (data: ConfirmResponseBody) => void;
}

const AahMsaForm = ({ eligibilityDataItem, onDataRecieved }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<AahMsaInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: AahMsaInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof AahMsaInputsState)[];
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

    const birthCountry = formData.get('recipientBirthCountry') as string;
    if (birthCountry !== 'FRANCE') {
      params.append('codeIso', birthCountry);
    }

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
        setIsFormDisabled(true);
      }
    });
  };

  const onCountrySelectedHandler = (e: ChangeEvent<HTMLInputElement>) => {
    const country = e.target.value;

    if (country.toUpperCase() === 'FRANCE') {
      setInputStates((inputStates) => ({
        ...inputStates,
        recipientBirthPlace: { state: 'default' },
      }));
    } else {
      setInputStates(initialInputsState);
    }
  };

  const isBirthPlaceRequired = () => {
    return !!Object.keys(inputStates).find((key) => key === 'recipientBirthPlace');
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <CommonMsaInputs
          onCountryChanged={onCountrySelectedHandler}
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired()}
        />

        <FormButton isDisabled={isFormDisabled} />
      </form>
    </div>
  );
};

export default AahMsaForm;
