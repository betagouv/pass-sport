import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  ConfirmResponseBody,
  ConfirmResponseError,
  SearchResponseBodyItem,
  YoungMsaInputsState,
} from 'types/EligibilityTest';
import { convertDate, mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import CommonMsaInputs from './common-msa-inputs/CommonMsaInputs';
import ErrorAlert from '../error-alert/ErrorAlert';
import { fetchPspCode } from '../../agent';

const initialInputsState: YoungMsaInputsState = {
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataRecieved: (data: ConfirmResponseBody) => void;
}

const YoungMsaForm = ({ eligibilityDataItem, onDataRecieved }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<YoungMsaInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);

  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: YoungMsaInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(inputStates) as (keyof YoungMsaInputsState)[];
    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldname) => {
      states[fieldname] = { state: 'default' };
    });

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
    const formData = new FormData(formRef.current!);

    formData.append('id', eligibilityDataItem.id.toString());
    formData.append('situation', eligibilityDataItem.situation);
    formData.append('organisme', eligibilityDataItem.organisme);
    formData.set('recipientLastname', formData.get('recipientLastname')!.toString().trim());
    formData.set('recipientFirstname', formData.get('recipientFirstname')!.toString().trim());

    const formattedRecipientBirthDate =
      convertDate(formData.get('recipientBirthDate') as string) ?? '';
    formData.set('recipientBirthDate', formattedRecipientBirthDate);

    const birthCountry = formData.get('recipientBirthCountry') as string;
    if (birthCountry === 'FR') {
      formData.delete('recipientBirthCountry');
    }

    return fetchPspCode(formData);
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
      setIsFormDisabled(true);
      if (status !== 200) {
        notifyError(status, body as ConfirmResponseError);
      } else {
        onDataRecieved(body as ConfirmResponseBody);
      }
    });
  };

  const onCountrySelectedHandler = (e: ChangeEvent<HTMLSelectElement>) => {
    const country = e.target.value;

    if (country.toUpperCase() === 'FR') {
      setInputStates((inputStates) => ({
        ...inputStates,
        recipientBirthPlace: { state: 'default' },
      }));
    } else {
      setInputStates(initialInputsState);
    }
  };

  const onBirthPlaceChanged = (text: string | null) => {
    if (!text) {
      setInputStates((inputStates) => ({
        ...inputStates,
        recipientBirthPlace: { state: 'error' },
      }));
    } else {
      setInputStates((inputStates) => ({
        ...inputStates,
        recipientBirthPlace: { state: 'default' },
      }));
    }
  };

  const isBirthPlaceRequired = () => {
    return !!Object.keys(inputStates).find((key) => key === 'recipientBirthPlace');
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label="Nom de l’allocataire*"
          nativeInputProps={{
            name: 'recipientLastname',
            placeholder: 'ex: Dupont',
          }}
          state={inputStates.recipientLastname.state}
          stateRelatedMessage={inputStates.recipientLastname.errorMsg}
          disabled={isFormDisabled}
        />

        <Input
          label="Prénom de l’allocataire*"
          nativeInputProps={{ name: 'recipientFirstname', placeholder: 'ex: Marie' }}
          state={inputStates.recipientFirstname.state}
          stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
          disabled={isFormDisabled}
        />

        <Input
          label="Date de naissance de l’allocataire*"
          hintText="Format attendu JJ/MM/AAAA"
          nativeInputProps={{ name: 'recipientBirthDate', type: 'date' }}
          state={inputStates.recipientBirthDate.state}
          stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
          disabled={isFormDisabled}
        />

        <CommonMsaInputs
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired()}
          onCountryChanged={onCountrySelectedHandler}
          onBirthPlaceChanged={onBirthPlaceChanged}
        />
        <div className="fr-mt-3w">
          <FormButton isDisabled={isFormDisabled} />
        </div>
      </form>

      {error && <ErrorAlert title={error} />}
    </div>
  );
};

export default YoungMsaForm;
