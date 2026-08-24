import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import {
  ChangeEvent,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { StepOneFields, StepOneFormInputsState } from '@/types/EligibilityTest';
import CityFinder from '../city-finder/CityFinder';
import { mapper } from '../../helpers/helper';
import { CAF, CROUS, MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { formDefaultsFor } from '../../helpers/test-defaults';

interface Props {
  onValidated: (fields: StepOneFields) => void;
  isDirectBeneficiary?: boolean;
}

const initialInputsState: StepOneFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
};

/**
 * Identifies the beneficiary, and nothing else. It used to submit on its own and answer
 * "found / not found" — an enumeration oracle for anyone who could guess a name and a
 * commune. It now only unlocks step 2; the single LCA round-trip happens once the
 * allocataire's identifiers have been given too.
 */
const StepOneForm = ({ onValidated, isDirectBeneficiary = false }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance, caisse } = useContext(EligibilityTestContext);
  const [inputStates, setInputStates] = useState<StepOneFormInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);
  const defaults = formDefaultsFor(allowance, caisse);

  const isFormValid = (
    formData: FormData,
  ): { isValid: boolean; states: StepOneFormInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof StepOneFormInputsState)[];
    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldName) => {
      if (!formData.get(fieldName)) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const onSubmitHandler = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates(states);

    if (!isValid) {
      // Go through each input, stop at the first one in error and focus it. The CityFinder
      // is reached by id: its component does not forward the name to the visible input.
      for (const [key, value] of new Map(Object.entries(states))) {
        if (value.state === 'error') {
          formRef.current
            ?.querySelector<HTMLInputElement>(`[name="${key}"], #recipientResidencePlace`)
            ?.focus();
          break;
        }
      }

      return;
    }

    setIsFormDisabled(true);

    onValidated({
      beneficiaryLastname: formData.get('beneficiaryLastname')!.toString().trim(),
      beneficiaryFirstname: formData.get('beneficiaryFirstname')!.toString().trim(),
      recipientResidencePlace: formData.get('recipientResidencePlace')!.toString(),
    });
  };

  const onInputChanged = (text: string | null, field: keyof StepOneFormInputsState) => {
    setInputStates((states) => ({
      ...states,
      [field]: text ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
  };

  const getNameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Nom de famille de l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
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

  const getFirstnameLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
        return (
          <>
            Prénom de l&apos;enfant ou du jeune adulte bénéficiaire{' '}
            <span className="text--required">*</span>
          </>
        );
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
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

  const getResidencePlaceLabel = useCallback((): ReactNode => {
    switch (allowance) {
      case ALLOWANCE.AAH:
      case ALLOWANCE.AEEH:
      case ALLOWANCE.QF:
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

  const documentsHint = (what: 'Nom' | 'Prénom') => {
    if (allowance === ALLOWANCE.CROUS) {
      return (
        <>
          Format attendu : {what} tel qu&apos;il est écrit sur vos papiers du <CROUS />.
        </>
      );
    } else if (allowance === ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX) {
      return (
        <>
          Format attendu : Nom tel qu&apos;il est écrit sur votre notification de bourse régionale
        </>
      );
    } else {
      return (
        <>
          Format attendu : {what} tel qu&apos;il est écrit sur vos documents de la <CAF /> ou la{' '}
          <MSA />.
        </>
      );
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmitHandler}>
      <Input
        label={getNameLabel()}
        state={inputStates.beneficiaryLastname.state}
        stateRelatedMessage={inputStates.beneficiaryLastname.errorMsg}
        disabled={isFormDisabled}
        nativeInputProps={{
          name: 'beneficiaryLastname',
          defaultValue: defaults?.beneficiaryLastname,
          onChange: (e: ChangeEvent<HTMLInputElement>) =>
            onInputChanged(e.target.value, 'beneficiaryLastname'),
          autoComplete: 'family-name',
          'aria-autocomplete': 'none',
          required: true,
          autoFocus: true,
        }}
        hintText={documentsHint('Nom')}
      />

      <Input
        label={getFirstnameLabel()}
        state={inputStates.beneficiaryFirstname.state}
        stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
        disabled={isFormDisabled}
        nativeInputProps={{
          name: 'beneficiaryFirstname',
          defaultValue: defaults?.beneficiaryFirstname,
          onChange: (e: ChangeEvent<HTMLInputElement>) =>
            onInputChanged(e.target.value, 'beneficiaryFirstname'),
          autoComplete: 'given-name',
          'aria-autocomplete': 'none',
          required: true,
        }}
        hintText={documentsHint('Prénom')}
      />

      <CityFinder
        legend={getResidencePlaceLabel()}
        isDisabled={isFormDisabled}
        inputName="recipientResidencePlace"
        defaultOption={defaults?.recipientResidencePlace}
        inputState={inputStates.recipientResidencePlace}
        onChanged={(text) => onInputChanged(text, 'recipientResidencePlace')}
        onBlur={(text) => onInputChanged(text, 'recipientResidencePlace')}
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
  );
};

export default StepOneForm;
