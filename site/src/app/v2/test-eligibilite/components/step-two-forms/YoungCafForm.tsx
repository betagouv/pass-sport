import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useContext, useRef, useState } from 'react';
import { YoungCafInputsState } from '@/types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import { CAF } from '@/app/v2/accueil/components/acronymes/Acronymes';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { formDefaultsFor } from '../../helpers/test-defaults';
import { useStepTwoSubmit } from '../../hooks/use-step-two-submit';

const initialInputsState: YoungCafInputsState = {
  recipientCafNumber: { state: 'default' },
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
};

const CAF_NUMBER_ERROR = (
  <>
    Le numéro&nbsp; <CAF /> &nbsp;doit être composé de 7 chiffres
  </>
);

const YoungCafForm = () => {
  const formRef = useRef<HTMLFormElement>(null);
  const { allowance, caisse } = useContext(EligibilityTestContext);
  const [inputStates, setInputStates] = useState<YoungCafInputsState>(initialInputsState);
  const { isFormDisabled, error, submit } = useStepTwoSubmit();
  const defaults = formDefaultsFor(allowance, caisse);

  const isFormValid = (formData: FormData): { isValid: boolean; states: YoungCafInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof YoungCafInputsState)[];
    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldName) => {
      const value = (formData.get(fieldName) ?? '').toString().trim();

      if (!value) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
        return;
      }

      if (fieldName === 'recipientCafNumber' && !/^\d{7}$/.test(value)) {
        states[fieldName] = { state: 'error', errorMsg: CAF_NUMBER_ERROR };
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

    await submit({
      recipientCafNumber: formData.get('recipientCafNumber')!.toString().trim(),
      recipientLastname: formData.get('recipientLastname')!.toString().trim(),
      recipientFirstname: formData.get('recipientFirstname')!.toString().trim(),
    });
  };

  const onInputChanged = (text: string | null, field: keyof YoungCafInputsState) => {
    setInputStates((states) => ({
      ...states,
      [field]: text ? { state: 'default' } : { state: 'error', errorMsg: mapper[field] },
    }));
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
                onInputChanged(e.target.value, 'recipientCafNumber'),
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

        <Input
          label={
            <>
              Nom de l’allocataire <CAF /> <span className="text--required">*</span>
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
              onInputChanged(e.target.value, 'recipientLastname'),
            'aria-label': "Saisir le nom de l'allocataire CAF",
          }}
          hintText={
            <>
              Format attendu : Nom de l&apos;allocataire tel qu&apos;il est écrit sur vos papiers de
              la <CAF />.
            </>
          }
        />

        <Input
          label={
            <>
              Prénom de l’allocataire <CAF /> <span className="text--required">*</span>
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
              onInputChanged(e.target.value, 'recipientFirstname'),
            'aria-label': "Saisir le prénom de l'allocataire CAF",
          }}
          hintText={
            <>
              Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur les papiers
              de la <CAF />.
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

export default YoungCafForm;
