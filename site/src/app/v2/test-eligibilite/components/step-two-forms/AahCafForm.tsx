import { ChangeEvent, FormEvent, useContext, useRef, useState } from 'react';
import { AahCafInputsState } from '@/types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import { CAF } from '@/app/v2/accueil/components/acronymes/Acronymes';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { formDefaultsFor } from '../../helpers/test-defaults';
import { useStepTwoSubmit } from '../../hooks/use-step-two-submit';

const initialInputsState: AahCafInputsState = {
  recipientCafNumber: { state: 'default' },
};

const CAF_NUMBER_ERROR = (
  <>
    Le numéro&nbsp; <CAF /> &nbsp;doit être composé de 7 chiffres
  </>
);

const AahCafForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance, caisse } = useContext(EligibilityTestContext);
  const [inputStates, setInputStates] = useState<AahCafInputsState>(initialInputsState);
  const { isFormDisabled, error, submit } = useStepTwoSubmit();
  const defaults = formDefaultsFor(allowance, caisse);

  const isFormValid = (formData: FormData): { isValid: boolean; states: AahCafInputsState } => {
    const value = (formData.get('recipientCafNumber') ?? '').toString().trim();

    if (!value) {
      return {
        isValid: false,
        states: {
          recipientCafNumber: { state: 'error', errorMsg: mapper.recipientCafNumber },
        },
      };
    }

    if (!/^\d{7}$/.test(value)) {
      return {
        isValid: false,
        states: { recipientCafNumber: { state: 'error', errorMsg: CAF_NUMBER_ERROR } },
      };
    }

    return { isValid: true, states: initialInputsState };
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);
    const { isValid, states } = isFormValid(formData);

    setInputStates(states);

    if (!isValid) {
      return;
    }

    await submit({
      recipientCafNumber: formData.get('recipientCafNumber')!.toString().trim(),
    });
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <CustomInput
          inputProps={{
            label: (
              <>
                Numéro de l’allocataire <CAF /> <span className="text--required">*</span>
              </>
            ),
            hintText: 'Personne responsable du compte de l’allocation.',
            nativeInputProps: {
              name: 'recipientCafNumber',
              defaultValue: defaults?.recipientCafNumber,
              placeholder: 'Exemple : 0123456',
              type: 'text',
              required: true,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setInputStates({
                  recipientCafNumber: e.target.value
                    ? { state: 'default' }
                    : { state: 'error', errorMsg: mapper.recipientCafNumber },
                }),
              'aria-label': "Saisir le numéro de l'allocataire CAF",
              autoFocus: true,
            },
            state: inputStates.recipientCafNumber.state,
            stateRelatedMessage: inputStates.recipientCafNumber.errorMsg,
            disabled: isFormDisabled,
          }}
          secondHint={
            <>
              Aussi appelé « numéro de dossier ». Le numéro figure en haut à gauche de tous les
              courriers émis par la <CAF /> ainsi que sur toutes les attestations que vous pouvez
              télécharger depuis votre espace personnel.
            </>
          }
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

export default AahCafForm;
