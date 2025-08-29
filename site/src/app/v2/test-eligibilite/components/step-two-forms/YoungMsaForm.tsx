import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  ConfirmResponseErrorBody,
  EnhancedConfirmResponseBody,
  SearchResponseBodyItem,
  YoungMsaInputsState,
} from 'types/EligibilityTest';
import { convertDate, mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import ErrorAlert from '../error-alert/ErrorAlert';
import { fetchPspCode } from '../../agent';
import { MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import CommonInputs from '@/app/v2/test-eligibilite/components/step-two-forms/common-inputs/CommonInputs';

const initialInputsState: YoungMsaInputsState = {
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataReceived: (data: EnhancedConfirmResponseBody) => void;
  onEligibilitySuccess: () => void;
  onEligibilityFailure: () => void;
}

const YoungMsaForm = ({
  eligibilityDataItem,
  onDataReceived,
  onEligibilitySuccess,
  onEligibilityFailure,
}: Props) => {
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

  const requestPassSportCode = (): Promise<{
    status: number;
    body: EnhancedConfirmResponseBody | ConfirmResponseErrorBody;
  }> => {
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

  const notifyError = () => {
    setError('Une erreur a eu lieu. Merci de réessayer plus tard');
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates({ ...states });

    if (!isValid) {
      return;
    }

    await requestPassSportCode().then(
      ({
        status,
        body,
      }: {
        body: EnhancedConfirmResponseBody | ConfirmResponseErrorBody;
        status: number;
      }) => {
        if (status !== 200) {
          notifyError();
        } else {
          if ('message' in body) {
            notifyError();
            return;
          }

          onDataReceived(body);

          if (body?.length > 0) {
            onEligibilitySuccess();
            setIsFormDisabled(true);
          } else {
            onEligibilityFailure();
          }
        }
      },
    );
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
    <>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label={
            <>
              Nom de l&apos;allocataire <span className="text--required">*</span>
            </>
          }
          nativeInputProps={{
            name: 'recipientLastname',
            placeholder: 'ex: Dupont',
            'aria-label': "Saisir le nom de l'allocataire",
            required: true,
            autoFocus: true,
          }}
          state={inputStates.recipientLastname.state}
          stateRelatedMessage={inputStates.recipientLastname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            <>
              Format attendu : Nom de l&apos;allocataire tel qu&apos;il est écrit sur vos papiers de
              la <MSA />.
            </>
          }
        />

        <Input
          label={
            <>
              Prénom de l’allocataire <span className="text--required">*</span>
            </>
          }
          nativeInputProps={{
            name: 'recipientFirstname',
            placeholder: 'ex: Marie',
            'aria-label': "Saisir le prénom de l'allocataire",
            required: true,
          }}
          state={inputStates.recipientFirstname.state}
          stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            <>
              Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur les papiers
              de la <MSA />.
            </>
          }
        />

        <Input
          label={
            <>
              Date de naissance de l’allocataire <span className="text--required">*</span>
            </>
          }
          hintText="Format attendu : jj/mm/aaaa."
          nativeInputProps={{
            name: 'recipientBirthDate',
            type: 'date',
            min: '1950-01-01',
            max: '2099-12-31',
            'aria-label': "Saisir la date de naissance de l'allocataire",
            required: true,
          }}
          state={inputStates.recipientBirthDate.state}
          stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
          disabled={isFormDisabled}
        />

        <CommonInputs
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired()}
          onCountryChanged={onCountrySelectedHandler}
          onBirthPlaceChanged={onBirthPlaceChanged}
          shouldAutoFocus={false}
        />
        <div className="fr-mt-3w">
          <FormButton isDisabled={isFormDisabled} />
        </div>
      </form>

      {error && <ErrorAlert title={error} />}
    </>
  );
};

export default YoungMsaForm;
