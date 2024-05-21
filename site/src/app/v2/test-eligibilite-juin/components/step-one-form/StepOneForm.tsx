import Question, { QUESTION_STYLES } from '@/app/v2/test-eligibilite/components/Question/Question';
import Alert from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { FormEvent, useRef, useState } from 'react';
import {
  StepOneFormInputsState,
  SearchResponseBody,
  SearchResponseError,
} from 'types/EligibilityTest';
import styles from './styles.module.scss';
import cn from 'classnames';
import CustomInput from '../custom-input/CustomInput';

const initialInputsState: StepOneFormInputsState = {
  beneficiaryLastname: 'default',
  beneficiaryFirstname: 'default',
  beneficiaryBirthDate: 'default',
  recipientResidencePlace: 'default',
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

    const states = { ...initialInputsState };

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName);

      if (!value) {
        states[fieldName] = 'error';
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
      if (status !== 200) {
        notifyError(status, body as SearchResponseError);
      } else {
        setIsFormDisabled(true);
        onDataRecieved(body as SearchResponseBody);
      }
    });
  };

  const notifyError = (status: number, body: SearchResponseError) => {
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

  const requestEligibilityTest = (): Promise<{ status: number; body: unknown }> => {
    const domain = process.env.NEXT_PUBLIC_LCA_API_URL;

    if (!domain) {
      throw new Error('Error: NEXT_PUBLIC_LCA_API_URL is not set');
    }

    const baseUrl = `${domain}/gw/psp-server/beneficiaires/search`;
    const params = new URLSearchParams();

    const formData = new FormData(formRef.current!);

    params.append('nom', formData.get('beneficiaryLastname') as string);
    params.append('prenom', formData.get('beneficiaryFirstname') as string);
    params.append('dateNaissance', formData.get('beneficiaryBirthDate') as string);
    params.append('codeInsee', formData.get('recipientResidencePlace') as string);

    const url = new URL(baseUrl);
    url.search = params.toString();

    return fetch(url).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as unknown,
    }));
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
              nativeInputProps: { name: 'beneficiaryLastname' },
              state: inputStates.beneficiaryLastname,
              stateRelatedMessage: 'Le nom est requis',
              disabled: isFormDisabled,
            }}
            secondHint="Personne qui bénéficie des aides de la CAF ou la MSA"
          />

          <Input
            label="Prénom du bénéficaire*"
            nativeInputProps={{ name: 'beneficiaryFirstname' }}
            state={inputStates.beneficiaryFirstname}
            stateRelatedMessage="Le prénom est requis"
            disabled={isFormDisabled}
          />

          <Input
            label="Date de naissance du bénéficaire*"
            hintText="Format attendu: JJ/MM/AAAA"
            nativeInputProps={{ name: 'beneficiaryBirthDate' }}
            state={inputStates.beneficiaryBirthDate}
            stateRelatedMessage="La date de naissance est requise"
            disabled={isFormDisabled}
          />

          <CustomInput
            inputProps={{
              label: 'Commune de résidence de l’allocataire*',
              hintText:
                'Format attendu : Si le nom de la commune est composé, veillez à saisir un tiret entre deux noms (ex : Saint-Joseph), sauf si la commune débute par le, la, les, auxquels cas vous devez séparer d’un caractère « espace » (ex : Le Havre). Si votre commune comporte moins de 4 caractères il faut ajouter un espace à la fin (ex : Eus).',
              nativeInputProps: { name: 'recipientResidencePlace' },
              state: inputStates.recipientResidencePlace,
              stateRelatedMessage: 'La commune de naissance est requise',
              disabled: isFormDisabled,
            }}
            secondHint="L’allocataire est la personne qui perçoit au moins une aide en regard de leur situation familiale et/ou monétaire."
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

      {error && (
        <Alert
          //   className={styles.error}
          severity="error"
          //   isClosed={!isError}
          onClose={() => setError(null)}
          title={error}
          //   description="Veuillez réessayer plus tard"
          closable
        />
      )}
    </div>
  );
};

export default StepOneForm;
