import Question, {
  QUESTION_STYLES,
} from '@/app/v2/test-eligibilite-mai/components/Question/Question';
import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import {
  StepOneFormInputsState,
  SearchResponseBody,
  SearchResponseErrorBody,
} from 'types/EligibilityTest';
import styles from './styles.module.scss';
import cn from 'classnames';
import CustomInput from '../custom-input/CustomInput';
import CityFinder from '../city-finder/CityFinder';
import { mapper } from '../../helpers/helper';
import ErrorAlert from '../error-alert/ErrorAlert';

const initialInputsState: StepOneFormInputsState = {
  beneficiaryLastname: { state: 'default' },
  beneficiaryFirstname: { state: 'default' },
  beneficiaryBirthDate: { state: 'default' },
  recipientResidencePlace: { state: 'default' },
};

interface Props {
  onDataRecieved: (data: SearchResponseBody) => void;
}

const StepOneForm = ({ onDataRecieved }: Props) => {
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
      return;
    }

    await requestEligibilityTest().then(({ status, body }) => {
      setIsFormDisabled(true);
      if (status !== 200) {
        notifyError(status, body as SearchResponseErrorBody);
      } else {
        if ('message' in body) {
          notifyError(status, body);
          return;
        }
        onDataRecieved(body);
      }
    });
  };

  const notifyError = (status: number, body: SearchResponseErrorBody) => {
    if (
      status === 400 &&
      body.message ===
        "Aucun exercice en cours, vous n'êtes pas autorisé à vous inscrire au Pass'Sport pour le moment."
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
    const domain = process.env.NEXT_PUBLIC_LCA_API_URL;

    if (!domain) {
      throw new Error('Error: NEXT_PUBLIC_LCA_API_URL is not set');
    }

    const baseUrl = `${domain}/gw/psp-server/beneficiaires/search`;
    const params = new URLSearchParams();

    const formData = new FormData(formRef.current!);

    params.append('nom', formData.get('beneficiaryLastname')!.toString().trim());
    params.append('prenom', formData.get('beneficiaryFirstname')!.toString().trim());
    params.append('dateNaissance', formData.get('beneficiaryBirthDate')!.toString().trim());
    params.append('codeInsee', formData.get('recipientResidencePlace') as string);

    const url = new URL(baseUrl);
    url.search = params.toString();

    return fetch(url).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as SearchResponseBody | SearchResponseErrorBody,
    }));
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
    <div>
      <Question
        question="Veuillez rentrer les informations ci-dessous sur vous ou sur votre enfant :"
        style={QUESTION_STYLES.JUNE_STYLE}
      >
        <form ref={formRef} onSubmit={onSubmitHandler}>
          <p className={cn('fr-pb-2w', styles.paragraph)}>
            Les champs ci-dessous sont obligatoires*
          </p>

          <CustomInput
            inputProps={{
              label: 'Nom du bénéficaire*',
              nativeInputProps: {
                name: 'beneficiaryLastname',
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  onInputChanged(e.target.value, 'beneficiaryLastname'),
              },
              state: inputStates.beneficiaryLastname.state,
              stateRelatedMessage: inputStates.beneficiaryLastname.errorMsg,
              disabled: isFormDisabled,
            }}
            secondHint="Personne qui bénéficie des aides de la CAF ou la MSA"
          />

          <Input
            label="Prénom du bénéficaire*"
            nativeInputProps={{
              name: 'beneficiaryFirstname',
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                onInputChanged(e.target.value, 'beneficiaryFirstname'),
            }}
            state={inputStates.beneficiaryFirstname.state}
            stateRelatedMessage={inputStates.beneficiaryFirstname.errorMsg}
            disabled={isFormDisabled}
          />

          <Input
            label="Date de naissance du bénéficaire*"
            hintText="Format attendu: JJ/MM/AAAA"
            nativeInputProps={{
              name: 'beneficiaryBirthDate',
              type: 'date',
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                onInputChanged(e.target.value, 'beneficiaryBirthDate'),
            }}
            state={inputStates.beneficiaryBirthDate.state}
            stateRelatedMessage={inputStates.beneficiaryBirthDate.errorMsg}
            disabled={isFormDisabled}
          />

          <CityFinder
            legend="Commune de résidence de l’allocataire*"
            isDisabled={isFormDisabled}
            inputName="recipientResidencePlace"
            inputState={inputStates.recipientResidencePlace}
            onChanged={(text) => onInputChanged(text, 'recipientResidencePlace')}
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
      </Question>

      {error && <ErrorAlert title={error} />}
    </div>
  );
};

export default StepOneForm;
