import { ChangeEvent, FormEvent, useContext, useRef, useState } from 'react';
import { CrousInputsState } from '@/types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import { CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { FRANCE_ISO_CODE } from '../../helpers/countries';
import { useStepTwoSubmit } from '../../hooks/use-step-two-submit';
import { useRecipientEmail } from '../../hooks/use-recipient-email';
import CommonInputs from '@/app/v2/test-eligibilite/components/step-two-forms/common-inputs/CommonInputs';
import RecipientEmailInput from '@/app/v2/test-eligibilite/components/step-two-forms/common-inputs/RecipientEmailInput';
import FormButton from '@/app/v2/test-eligibilite/components/step-two-forms/common-inputs/FormButton';

const initialInputsState: CrousInputsState = {
  recipientIneNumber: { state: 'default' },
  recipientBirthCountry: { state: 'default' },
  recipientBirthPlace: { state: 'default' },
};

const IDENTIFICATION_ERROR =
  'Renseignez votre numéro INE, ou à défaut vos pays et commune de naissance.';

/**
 * The step-one search no longer runs on its own, so whether LCA holds an INE for this student
 * is unknown when the form is drawn. Both identifiers are offered and either one is enough.
 */
const CrousForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance } = useContext(EligibilityTestContext);
  const [inputStates, setInputStates] = useState<CrousInputsState>(initialInputsState);
  const { isFormDisabled, error, submit } = useStepTwoSubmit();
  const email = useRecipientEmail();
  const [identificationError, setIdentificationError] = useState<string | null>(null);
  const [isBirthPlaceRequired, setIsBirthPlaceRequired] = useState<boolean>(false);

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIdentificationError(null);

    const formData = new FormData(formRef.current!);
    const ine = (formData.get('recipientIneNumber') ?? '').toString().trim();
    const birthCountry = (formData.get('recipientBirthCountry') ?? '').toString().trim();
    const birthPlace = (formData.get('recipientBirthPlace') ?? '').toString().trim();
    // Runs before the identification branches so both errors surface in the same pass
    const recipientEmail = email.validate(formData);

    if (!ine && !birthCountry) {
      setIdentificationError(IDENTIFICATION_ERROR);
      return;
    }

    if (!ine && birthCountry === FRANCE_ISO_CODE && !birthPlace) {
      setInputStates((states) => ({
        ...states,
        recipientBirthPlace: { state: 'error', errorMsg: mapper.recipientBirthPlace },
      }));
      return;
    }

    if (!recipientEmail) {
      return;
    }

    await submit({
      recipientEmail,
      recipientIneNumber: ine || undefined,
      // LCA reads the commune for someone born in France, and the country for everyone else
      recipientBirthCountry:
        birthCountry === FRANCE_ISO_CODE ? undefined : birthCountry || undefined,
      recipientBirthPlace: birthPlace || undefined,
    });
  };

  const setFieldState = (field: keyof CrousInputsState, hasValue: unknown) => {
    setInputStates((states) => ({
      ...states,
      [field]: hasValue ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
  };

  const onCountryChanged = (e: ChangeEvent<HTMLSelectElement>) => {
    setIsBirthPlaceRequired(e.target.value.toUpperCase() === FRANCE_ISO_CODE);
    setFieldState('recipientBirthCountry', e.target.value);
    setIdentificationError(null);
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <CustomInput
          inputProps={{
            label:
              allowance === ALLOWANCE.CROUS ? (
                <>
                  Numéro INE provenant du <CROUS />
                </>
              ) : (
                <>Numéro INE provenant des formations sanitaires et sociales</>
              ),
            hintText:
              'Format attendu : composé de 11 caractères, soit 10 chiffres et 1 lettre soit 9 chiffres et 2 lettres',
            nativeInputProps: {
              name: 'recipientIneNumber',
              placeholder: 'ex: 0000000000X ou 00000000XX',
              type: 'text',
              onChange: (e: ChangeEvent<HTMLInputElement>) => {
                setFieldState('recipientIneNumber', e.target.value);
                setIdentificationError(null);
              },
              'aria-label': 'Saisir le numéro INE',
              autoFocus: true,
            },
            state: inputStates.recipientIneNumber?.state,
            stateRelatedMessage: inputStates.recipientIneNumber?.errorMsg,
            disabled: isFormDisabled,
          }}
          secondHint="Si vous ne disposez pas de numéro INE, renseignez vos pays et commune de naissance ci-dessous."
        />

        <CommonInputs
          birthCountryInputName="recipientBirthCountry"
          birthPlaceInputName="recipientBirthPlace"
          inputStates={inputStates}
          areInputsDisabled={isFormDisabled}
          isBirthInputRequired={isBirthPlaceRequired}
          onCountryChanged={onCountryChanged}
          onBirthPlaceChanged={(text) => setFieldState('recipientBirthPlace', text)}
          isDirectBeneficiary
          shouldAutoFocus={false}
          isCountryRequired={false}
          countryLabel="Pays de naissance"
          birthPlaceLabel="Commune de naissance"
        />

        <RecipientEmailInput
          inputState={email.inputState}
          isDisabled={isFormDisabled}
          onChange={email.onChange}
          onBlur={email.onBlur}
        />

        <FormButton isDisabled={isFormDisabled} />
      </form>

      {(identificationError || error) && (
        <div className="fr-mt-4w">
          <ErrorAlert title={identificationError ?? error!} />
        </div>
      )}
    </div>
  );
};

export default CrousForm;
