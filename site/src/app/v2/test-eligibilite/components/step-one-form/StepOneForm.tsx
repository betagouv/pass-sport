import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  SearchResponseBody,
  SearchResponseErrorBody,
  StepOneFormInputsState,
} from 'types/EligibilityTest';
import CityFinder from '../city-finder/CityFinder';
import { mapper } from '../../helpers/helper';
import ErrorAlert from '../error-alert/ErrorAlert';
import { fetchEligible } from '../../agent';
import { push } from '@socialgouv/matomo-next';
import Legend from '@/app/v2/test-eligibilite-base/components/customRadioButtons/legend/Legend';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';

interface Props {
  onDataReceived: (data: SearchResponseBody) => void;
  onEligibilityFailure: () => void;
  isDirectBeneficiary?: boolean;
}

const initialInputsState: StepOneFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  beneficiaryBirthDate: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
};

const StepOneForm = ({
  onDataReceived,
  onEligibilityFailure,
  isDirectBeneficiary = false,
}: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<StepOneFormInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const [error, setError] = useState<string | null>();
  const isFormValid = (
    formData: FormData,
  ): { isValid: boolean; states: StepOneFormInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof StepOneFormInputsState)[];
    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName);

      if (!value) {
        states[fieldName].state = 'error';
        states[fieldName].errorMsg = mapper[fieldName];
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates({ ...states });

    if (!isValid) {
      // Go through each input, stops at the first one and focuses on it
      // Transform into map for iteration to preserve the order of the keys
      for (const [key, value] of new Map(Object.entries(states))) {
        if (value.state === 'error') {
          // Need to get the city finder as an id as the name is not transferred through their component
          const invalidInput: HTMLInputElement | null | undefined = formRef.current?.querySelector(
            `[name="${key}"], #recipientResidencePlace`,
          );

          invalidInput?.focus();
          break;
        }
      }

      return;
    }

    await requestEligibilityTest().then(({ status, body }) => {
      if (status !== 200) {
        notifyError(status, body as SearchResponseErrorBody);
      } else {
        if ('message' in body) {
          notifyError(status, body);
          return;
        }

        onDataReceived(body);

        if (body?.length === 0) {
          onEligibilityFailure();
        } else {
          setIsFormDisabled(true);
          push([
            'trackEvent',
            'Eligibility Test',
            'Eligibility test step 1',
            `Eligibility test step 1 successful`,
          ]);
        }
      }
    });
  };

  const notifyError = (status: number, body: SearchResponseErrorBody) => {
    if (
      status === 400 &&
      body.message ===
        "Aucun exercice en cours, vous n'êtes pas autorisé à vous inscrire au pass Sport pour le moment."
    ) {
      setError('Le service est actuellement fermé');
    } else {
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    }
  };

  const requestEligibilityTest = (): Promise<{
    status: number;
    body: SearchResponseBody | SearchResponseErrorBody;
  }> => {
    const formData = new FormData(formRef.current!);

    formData.set('beneficiaryLastname', formData.get('beneficiaryLastname')!.toString().trim());
    formData.set('beneficiaryFirstname', formData.get('beneficiaryFirstname')!.toString().trim());
    formData.set('beneficiaryBirthDate', formData.get('beneficiaryBirthDate')!.toString().trim());

    return fetchEligible(formData);
  };

  const onInputChanged = (text: string | null, field: keyof StepOneFormInputsState) => {
    if (!text) {
      setInputStates((inputStates) => ({
        ...inputStates,
        [`${field}`]: { state: 'error', errorMsg: mapper[field] },
      }));
    } else {
      setInputStates((inputStates) => ({
        ...inputStates,
        [`${field}`]: { state: 'default' },
      }));
    }
  };

  return (
    <>
      <Legend
        wrapInParagraph
        line1={
          isDirectBeneficiary
            ? `Veuillez rentrer les informations ci-dessous sur vous :`
            : `Veuillez rentrer les informations ci-dessous sur vous ou sur votre enfant :`
        }
      />
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label={isDirectBeneficiary ? `Nom*` : `Nom du bénéficiaire*`}
          nativeInputProps={{
            name: 'beneficiaryLastname',
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'beneficiaryLastname'),
            autoComplete: 'family-name',
            'aria-autocomplete': 'none',
            required: true,
            autoFocus: true,
          }}
          state={inputStates.beneficiaryLastname.state}
          stateRelatedMessage={inputStates.beneficiaryLastname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            isDirectBeneficiary ? (
              <>
                Format attendu : Votre nom tel qu’il est écrit sur vos papiers du <CROUS />
              </>
            ) : (
              <>
                Format attendu : Votre nom tel qu’il est écrit sur vos papiers de la <CAF /> ou la{' '}
                <MSA />
              </>
            )
          }
        />

        <Input
          label={isDirectBeneficiary ? `Prénom*` : `Prénom du bénéficiaire*`}
          nativeInputProps={{
            name: 'beneficiaryFirstname',
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'beneficiaryFirstname'),
            autoComplete: 'given-name',
            'aria-autocomplete': 'none',
            required: true,
          }}
          state={inputStates.beneficiaryFirstname.state}
          stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            isDirectBeneficiary ? (
              <>
                Format attendu : Votre prénom tel qu’il est écrit sur vos papiers du <CROUS />
              </>
            ) : (
              <>
                Format attendu : Votre prénom tel qu’il est écrit sur vos papiers de la <CAF /> ou
                la <MSA />
              </>
            )
          }
        />

        <Input
          label={isDirectBeneficiary ? `Date de naissance*` : `Date de naissance du bénéficiaire*`}
          hintText="Format attendu: JJ/MM/AAAA"
          nativeInputProps={{
            name: 'beneficiaryBirthDate',
            type: 'date',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'beneficiaryBirthDate'),
          }}
          state={inputStates.beneficiaryBirthDate.state}
          stateRelatedMessage={inputStates.beneficiaryBirthDate.errorMsg}
          disabled={isFormDisabled}
        />

        <CityFinder
          legend={
            isDirectBeneficiary ? `Commune de résidence*` : `Commune de résidence de l’allocataire*`
          }
          isDisabled={isFormDisabled}
          inputName="recipientResidencePlace"
          inputState={inputStates.recipientResidencePlace}
          onChanged={(text) => onInputChanged(text, 'recipientResidencePlace')}
          required={true}
          secondHintNeeded={!isDirectBeneficiary}
        />

        <Button
          priority="primary"
          type="submit"
          disabled={isFormDisabled}
          iconId={isFormDisabled ? 'fr-icon-success-line' : 'fr-icon-arrow-right-line'}
          iconPosition="right"
          className="fr-mb-6w fr-mt-3w"
        >
          Je valide les informations
        </Button>
      </form>

      {error && <ErrorAlert title={error} />}
    </>
  );
};

export default StepOneForm;
