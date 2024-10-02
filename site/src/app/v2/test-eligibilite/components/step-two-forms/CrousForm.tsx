import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  ConfirmResponseErrorBody,
  CrousInputsState,
  EnhancedConfirmResponseBody,
  SearchResponseBodyItem,
} from 'types/EligibilityTest';
import { mapper } from '../../helpers/helper';
import FormButton from './FormButton';
import CustomInput from '../custom-input/CustomInput';
import ErrorAlert from '../error-alert/ErrorAlert';
import { fetchPspCode } from '../../agent';
import { CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';

const initialInputsState: CrousInputsState = {
  recipientIneNumber: { state: 'default' },
};

interface Props {
  eligibilityDataItem: SearchResponseBodyItem;
  onDataReceived: (data: EnhancedConfirmResponseBody) => void;
  onEligibilitySuccess: () => void;
  onEligibilityFailure: () => void;
}

const CrousForm = ({
  eligibilityDataItem,
  onDataReceived,
  onEligibilitySuccess,
  onEligibilityFailure,
}: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<CrousInputsState>(initialInputsState);
  const [isFormDisabled, setIsFormDisabled] = useState<boolean>(false);

  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: CrousInputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof CrousInputsState)[];

    const states = structuredClone(initialInputsState);

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

    formData.set('recipientIneNumber', formData.get('recipientIneNumber')!.toString().trim());

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

  const onInputChanged = (text: string | null, field: keyof CrousInputsState) => {
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
                Numéro INE provenant du <CROUS />*
              </>
            ),
            hintText: 'Format attendu : 9 chiffres et 2 lettres ou 10 chiffres et 1 lettre',
            nativeInputProps: {
              name: 'recipientIneNumber',
              placeholder: 'ex: 00000000XX ou 0000000000X',
              type: 'text',
              required: true,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                onInputChanged(e.target.value, 'recipientIneNumber'),
              'aria-label': 'Saisir le numéro INE',
              autoFocus: true,
            },
            state: inputStates.recipientIneNumber.state,
            stateRelatedMessage: inputStates.recipientIneNumber.errorMsg,
            disabled: isFormDisabled,
          }}
          secondHint={null}
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

export default CrousForm;
