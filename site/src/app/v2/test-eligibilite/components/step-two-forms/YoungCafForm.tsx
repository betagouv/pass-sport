import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  ConfirmResponseErrorBody,
  EnhancedConfirmResponseBody,
  SearchResponseBodyItem,
  YoungCafInputsState,
} from 'types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import { fetchPspCode } from '../../agent';
import { CAF } from '@/app/v2/accueil/components/acronymes/Acronymes';

const initialInputsState: YoungCafInputsState = {
  recipientCafNumber: { state: 'default' },
  recipientLastname: { state: 'default' },
  recipientFirstname: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataReceived: (data: EnhancedConfirmResponseBody) => void;
  onEligibilitySuccess: () => void;
  onEligibilityFailure: () => void;
}

const YoungCafForm = ({
  eligibilityDataItem,
  onDataReceived,
  onEligibilitySuccess,
  onEligibilityFailure,
}: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<YoungCafInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);

  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: YoungCafInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof YoungCafInputsState)[];

    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName);

      if (!value) {
        states[fieldName] = { state: 'error', errorMsg: mapper[fieldName] };
        isValid = false;
      } else {
        if (typeof value === 'string') {
          if (fieldName === 'recipientCafNumber') {
            if (!/^\d{7}$/.test(value)) {
              states[fieldName] = {
                state: 'error',
                errorMsg: (
                  <>
                    Le numéro&nbsp; <CAF /> &nbsp;doit être composé de 7 chiffres
                  </>
                ),
              };

              isValid = false;
            }
          }
        }
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
    formData.set('recipientCafNumber', formData.get('recipientCafNumber')!.toString().trim());

    return fetchPspCode(formData);
  };

  const notifyError = () => {
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

  const onInputChanged = (text: string | null, field: keyof YoungCafInputsState) => {
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
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <CustomInput
          inputProps={{
            label: (
              <>
                Numéro de l’allocataire <CAF /> <span className="text--required">*</span>
              </>
            ),
            hintText:
              'Personne responsable du compte gérant l’allocation. Peut être la même personne que le bénéficiaire.',
            nativeInputProps: {
              name: 'recipientCafNumber',
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
              Appelé « numéro de dossier » Le numéro figure en haut à gauche de tous les courriers
              émis par la <CAF /> ainsi que sur toutes les attestations que vous pouvez télécharger
              depuis votre espace personnel.
            </>
          }
        />

        <Input
          label={
            <>
              Nom de l’allocataire <CAF /> <span className="text--required">*</span>
            </>
          }
          nativeInputProps={{
            name: 'recipientLastname',
            placeholder: 'ex: Dupont',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'recipientLastname'),
            'aria-label': "Saisir le nom de l'allocataire CAF",
          }}
          state={inputStates.recipientLastname.state}
          stateRelatedMessage={inputStates.recipientLastname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            <>
              Format attendu : Nom de l&apos;allocataire tel qu&apos;il est écrit sur les papiers de
              la
              <CAF />
            </>
          }
        />
        <Input
          label={
            <>
              Prénom de l’allocataire <CAF /> <span className="text--required">*</span>
            </>
          }
          nativeInputProps={{
            name: 'recipientFirstname',
            placeholder: 'ex: Marie',
            required: true,
            onChange: (e: ChangeEvent<HTMLInputElement>) =>
              onInputChanged(e.target.value, 'recipientFirstname'),
            'aria-label': "Saisir le prénom de l'allocataire CAF",
          }}
          state={inputStates.recipientFirstname.state}
          stateRelatedMessage={inputStates.recipientFirstname.errorMsg}
          disabled={isFormDisabled}
          hintText={
            <>
              Format attendu : Prénom de l&apos;allocataire tel qu&apos;il est écrit sur les papiers
              de la <CAF />
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
