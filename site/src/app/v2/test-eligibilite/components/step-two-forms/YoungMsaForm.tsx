import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useContext, useRef, useState } from 'react';
import { YoungMsaInputsState } from '@/types/EligibilityTest';
import { convertDate, mapper } from '../../helpers/helper';
import ErrorAlert from '../error-alert/ErrorAlert';
import { MSA } from '@/app/v2/accueil/components/acronymes/Acronymes';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { FRANCE_ISO_CODE } from '../../helpers/countries';
import { formDefaultsFor } from '../../helpers/test-defaults';
import { useStepTwoSubmit } from '../../hooks/use-step-two-submit';
import { useRecipientEmail } from '../../hooks/use-recipient-email';
import CommonInputs from '@/app/v2/test-eligibilite/components/merged-eligibility-form/common-inputs/CommonInputs';
import RecipientEmailInput from '@/app/v2/test-eligibilite/components/merged-eligibility-form/common-inputs/RecipientEmailInput';
import FormButton from '@/app/v2/test-eligibilite/components/merged-eligibility-form/FormButton';

const initialInputsState: YoungMsaInputsState = {
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
  recipientBirthDate: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
};

const YoungMsaForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance, caisse } = useContext(EligibilityTestContext);
  const [inputStates, setInputStates] = useState<YoungMsaInputsState>(initialInputsState);
  const { isFormDisabled, error, submit } = useStepTwoSubmit();
  const email = useRecipientEmail();
  const defaults = formDefaultsFor(allowance, caisse);
  const [isBirthPlaceRequired, setIsBirthPlaceRequired] = useState<boolean>(
    defaults?.recipientBirthCountry === FRANCE_ISO_CODE,
  );

  const requiredFields = (): (keyof YoungMsaInputsState)[] => [
    'recipientLastname',
    'recipientFirstname',
    'recipientBirthDate',
    'recipientBirthCountry',
    // Only asked for, and only accepted by LCA, when the country is France
    ...(isBirthPlaceRequired ? (['recipientBirthPlace'] as const) : []),
  ];

  const isFormValid = (formData: FormData): { isValid: boolean; states: YoungMsaInputsState } => {
    let isValid = true;
    const states = structuredClone(initialInputsState);

    requiredFields().forEach((fieldName) => {
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
    const recipientEmail = email.validate(formData);

    setInputStates(states);

    if (!isValid || !recipientEmail) {
      return;
    }

    const birthCountry = (formData.get('recipientBirthCountry') ?? '').toString();

    await submit({
      recipientLastname: formData.get('recipientLastname')!.toString().trim(),
      recipientFirstname: formData.get('recipientFirstname')!.toString().trim(),
      recipientBirthDate: convertDate(formData.get('recipientBirthDate')!.toString()) ?? '',
      // LCA reads the commune for someone born in France, and the country for everyone else
      recipientBirthCountry: birthCountry === FRANCE_ISO_CODE ? undefined : birthCountry,
      recipientBirthPlace: (formData.get('recipientBirthPlace') ?? '').toString() || undefined,
      recipientEmail,
    });
  };

  const setFieldState = (field: keyof YoungMsaInputsState, hasValue: unknown) => {
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
        <Input
          label={
            <>
              Nom de l’allocataire <MSA /> <span className="text--required">*</span>
            </>
          }
          state={inputStates.recipientLastname.state}
          stateRelatedMessage={inputStates.recipientLastname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'recipientLastname',
            defaultValue: defaults?.recipientLastname,
            placeholder: 'ex: Dupont',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('recipientLastname', e.target.value),
            'aria-label': "Saisir le nom de l'allocataire",
            autoFocus: true,
          }}
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
              Prénom de l’allocataire <MSA /> <span className="text--required">*</span>
            </>
          }
          state={inputStates.recipientFirstname.state}
          stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'recipientFirstname',
            defaultValue: defaults?.recipientFirstname,
            placeholder: 'ex: Marie',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('recipientFirstname', e.target.value),
            'aria-label': "Saisir le prénom de l'allocataire",
          }}
          hintText={
            <>
              Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur vos papiers
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
          hintText="Exemple : 31/12/1980."
          state={inputStates.recipientBirthDate.state}
          stateRelatedMessage={inputStates.recipientBirthDate.errorMsg}
          disabled={isFormDisabled}
          nativeInputProps={{
            name: 'recipientBirthDate',
            defaultValue: defaults?.recipientBirthDate,
            type: 'date',
            min: '1900-01-01',
            max: '2099-12-31',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              setFieldState('recipientBirthDate', e.target.value),
            'aria-label': "Saisir la date de naissance de l'allocataire",
          }}
        />

        <CommonInputs
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired}
          onCountryChanged={onCountryChanged}
          onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
          shouldAutoFocus={false}
          defaultBirthCountry={defaults?.recipientBirthCountry}
          defaultBirthPlace={defaults?.recipientBirthPlace}
        />

        <RecipientEmailInput
          inputState={email.inputState}
          isDisabled={isFormDisabled}
          onChange={email.onChange}
          onBlur={email.onBlur}
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

export default YoungMsaForm;
