import Alert from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import { FormEvent, useRef, useState } from 'react';
import { InputsState, SearchResponseBody, SearchResponseError } from 'types/EligibilityTest';

const initialInputsState: InputsState = {
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

  const [inputStates, setInputStates] = useState<InputsState>(initialInputsState);
  const [error, setError] = useState<string | null>();

  const isFormValid = (formData: FormData): { isValid: boolean; states: InputsState } => {
    let isValid = true;

    const fieldNames = Object.keys(initialInputsState) as (keyof InputsState)[];

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
    params.append('codeInsee', '67482');

    const url = new URL(baseUrl);
    url.search = params.toString();
    return fetch(url).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as unknown,
    }));
  };

  return (
    <div>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <p>Veuillez rentrer les informations ci-dessous sur vous ou sur votre enfant :</p>
        <p>Les champs ci-dessous sont obligatoires</p>
        <Input
          label="Nom du bénéficaire*"
          hintText="Nom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: 'beneficiaryLastname' }}
          state={inputStates.beneficiaryLastname}
          stateRelatedMessage="Le nom est requis"
        />

        <Input
          label="Prénom du bénéficaire*"
          hintText="Prénom de la personne qui bénéficie des aides de la CAF ou la MSA"
          nativeInputProps={{ name: 'beneficiaryFirstname' }}
          state={inputStates.beneficiaryFirstname}
          stateRelatedMessage="Le prénom est requis"
        />

        <Input
          label="Date de naissance du bénéficaire*"
          hintText="Date de naissance de la personne qui bénéficie des aides de la CAF ou la MSA, sous le format jour, mois, année comme suit JJ/MM/AAAA"
          nativeInputProps={{ name: 'beneficiaryBirthDate' }}
          state={inputStates.beneficiaryBirthDate}
          stateRelatedMessage="La date de naissance est requise"
        />

        <Input
          label="Commune de résidence de l’allocataire*"
          hintText="L’allocataire est la personne qui perçoit au moins une aide en regard de leur situation familiale et/ou monétaire.
      Si le nom de la commune est composé, veillez à saisir un tiret entre deux noms (ex : Saint-Joseph), sauf si la commune débute par le, la, les, auxquels cas vous devez séparer d’un caractère « espace » (ex : Le Havre). Si votre commune comporte moins de 4 caractères il faut ajouter un espace à la fin (ex : Eus)."
          nativeInputProps={{ name: 'recipientResidencePlace' }}
          state={inputStates.recipientResidencePlace}
          stateRelatedMessage="La commune de naissance est requise"
        />

        <Button priority="primary" type="submit">
          Je valide les informations
        </Button>
      </form>

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
