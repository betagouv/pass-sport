import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { AahMsaInputsState } from '@/types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import ErrorAlert from '../error-alert/ErrorAlert';
import CommonInputs from './common-inputs/CommonInputs';
import { FRANCE_ISO_CODE } from '../../helpers/countries';
import { useStepTwoSubmit } from '../../hooks/use-step-two-submit';

const initialInputsState: AahMsaInputsState = {
  recipientBirthCountry: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
};

const AahMsaForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<AahMsaInputsState>(initialInputsState);
  const { isFormDisabled, error, submit } = useStepTwoSubmit();
  const [isBirthPlaceRequired, setIsBirthPlaceRequired] = useState<boolean>(false);

  const isFormValid = (formData: FormData): { isValid: boolean; states: AahMsaInputsState } => {
    let isValid = true;
    const states = structuredClone(initialInputsState);

    const required: (keyof AahMsaInputsState)[] = [
      'recipientBirthCountry',
      ...(isBirthPlaceRequired ? (['recipientBirthPlace'] as const) : []),
    ];

    required.forEach((fieldName) => {
      if (!(formData.get(fieldName) ?? '').toString().trim()) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
      }
    });

    return { isValid, states };
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates(states);

    if (!isValid) {
      return;
    }

    const birthCountry = (formData.get('recipientBirthCountry') ?? '').toString();

    await submit({
      // LCA reads the commune for someone born in France, and the country for everyone else
      recipientBirthCountry: birthCountry === FRANCE_ISO_CODE ? undefined : birthCountry,
      recipientBirthPlace: (formData.get('recipientBirthPlace') ?? '').toString() || undefined,
    });
  };

  const setFieldState = (field: keyof AahMsaInputsState, hasValue: unknown) => {
    setInputStates((states) => ({
      ...states,
      [field]: hasValue ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
  };

  const onCountryChanged = (e: ChangeEvent<HTMLSelectElement>) => {
    setIsBirthPlaceRequired(e.target.value.toUpperCase() === FRANCE_ISO_CODE);
    setFieldState('recipientBirthCountry', e.target.value);
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <CommonInputs
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired}
          onCountryChanged={onCountryChanged}
          onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
          shouldAutoFocus
        />

        <FormButton isDisabled={isFormDisabled} />
      </form>

      {error && (
        <div className="fr-mt-4w">
          <ErrorAlert title={error} />
        </div>
      )}
    </div>
  );
};

export default AahMsaForm;
