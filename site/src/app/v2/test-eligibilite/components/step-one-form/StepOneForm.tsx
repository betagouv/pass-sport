import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useCallback, useContext, useRef, useState } from 'react';
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
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import EligibilityTestContext from '@/store/eligibilityTestContext';

interface Props {
  onDataReceived: (data: SearchResponseBody) => void;
  onEligibilityFailure: () => void;
  isDirectBeneficiary?: boolean;
}

const initialInputsState: StepOneFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
};

const StepOneForm = ({
  onDataReceived,
  onEligibilityFailure,
  isDirectBeneficiary = false,
}: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance, dob } = useContext(EligibilityTestContext);
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

    if (dob) {
      formData.set('beneficiaryBirthDate', dob);
    }

    // Later used to know if we need to use a default address for people who don't have any address
    if (isDirectBeneficiary) {
      formData.set('isFromCrous', 'true');
    }

    if (allowance) {
      formData.set('allowanceName', allowance);
    }

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

  const getNameLabel = useCallback(() => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Nom de famille de l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.ARS:
        return (
          <>
            Nom de famille de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Nom de famille <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getFirstnameLabel = useCallback(() => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Prénom l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>{' '}
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.ARS:
        return (
          <>
            Prénom de l&apos;enfant <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Prénom <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  const getRecipientResidencePlace = useCallback(() => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Commune de résidence de l’allocataire <span className="text--required">*</span>
          </>
        );
      case ALLOWANCE.ARS:
        return (
          <>
            Commune de résidence de l’allocataire <span className="text--required">*</span>
          </>
        );
      default:
        return (
          <>
            Commune de résidence <span className="text--required">*</span>
          </>
        );
    }
  }, [allowance]);

  return (
    <>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <Input
          label={getNameLabel()}
          state={inputStates.beneficiaryLastname.state}
          stateRelatedMessage={inputStates.beneficiaryLastname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'beneficiaryLastname',
            onBlur: (e) => {
              const inputIsValid = !!e.target?.checkValidity();

              setInputStates({
                ...inputStates,
                beneficiaryLastname: {
                  state: inputIsValid ? 'default' : 'error',
                  errorMsg: !inputIsValid ? mapper['beneficiaryLastname'] : '',
                },
              });
            },
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'beneficiaryLastname'),
            autoComplete: 'family-name',
            'aria-autocomplete': 'none',
            required: true,
            autoFocus: true,
          }}
          hintText={
            isDirectBeneficiary ? (
              <>
                Format attendu : Nom tel qu’il est écrit sur vos papiers du <CROUS />.
              </>
            ) : (
              <>
                Format attendu : Nom tel qu’il est écrit sur vos papiers de la <CAF /> ou la <MSA />
                .
              </>
            )
          }
        />

        <Input
          state={inputStates.beneficiaryFirstname.state}
          stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
          disabled={isFormDisabled}
          label={getFirstnameLabel()}
          nativeInputProps={{
            name: 'beneficiaryFirstname',
            onBlur: (e) => {
              const inputIsValid = !!e.target?.checkValidity();

              setInputStates({
                ...inputStates,
                beneficiaryFirstname: {
                  state: inputIsValid ? 'default' : 'error',
                  errorMsg: !inputIsValid ? mapper['beneficiaryFirstname'] : '',
                },
              });
            },
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'beneficiaryFirstname'),
            autoComplete: 'given-name',
            'aria-autocomplete': 'none',
            required: true,
          }}
          hintText={
            isDirectBeneficiary ? (
              <>
                Format attendu : Prénom tel qu’il est écrit sur vos papiers du <CROUS />.
              </>
            ) : (
              <>
                Format attendu : Prénom tel qu’il est écrit sur vos papiers de la <CAF /> ou la{' '}
                <MSA />.
              </>
            )
          }
        />

        <CityFinder
          legend={getRecipientResidencePlace()}
          isDisabled={isFormDisabled}
          inputName="recipientResidencePlace"
          inputState={inputStates.recipientResidencePlace}
          onChanged={(text) => onInputChanged(text, 'recipientResidencePlace')}
          required
        />

        <Button
          priority="primary"
          type="submit"
          disabled={isFormDisabled}
          iconId={isFormDisabled ? 'fr-icon-success-line' : 'fr-icon-arrow-right-line'}
          iconPosition="right"
        >
          Valider les informations
        </Button>
      </form>

      {error && <ErrorAlert title={error} />}
    </>
  );
};

export default StepOneForm;
