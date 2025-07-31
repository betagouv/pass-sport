'use client';

import { Alert } from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import Input from '@codegouvfr/react-dsfr/Input';
import Select from '@codegouvfr/react-dsfr/Select';
import React, { ChangeEvent, FormEvent, SyntheticEvent, useRef, useState } from 'react';
import { InputsState } from '@/types/Contact';
import { postContact } from '../../client-agent';
import styles from './styles.module.scss';
import { EMAIL_REGEX } from '@/utils/email';

const visitorReasons = {
  'aije-droit': 'Ai-je droit au pass Sport ?',
  'eligibility-test-fail': 'Mon test me dit que je ne suis pas éligible',
  'code-pas-reçu': "Je n'ai pas reçu mon code pass Sport",
  'obtenir-pass': "J'ai supprimé mon code par erreur",
  'code-fails': 'Mon code ne fonctionne pas',
  'club-pas-trouvé': 'Je ne trouve pas mon club',
  'refus-code-club': 'Mon club refuse de prendre le pass Sport',
  'club-wait-50': "Mon club attend d'être remboursé avant de me faire la déduction de 50 euros",
  'deja-paye-comment-rembourse':
    "j'ai déjà payé mon adhésion, comment me faire rembourser mon pass Sport ?",
  boursier: 'Je suis boursier ou boursière',
  other: 'Autre',
};

const proReasons = {
  'what-pass': "Qu'est-ce que le pass Sport ?",
  'devenir-partenaire': 'Comment devenir partenaire ?',
  'club-code-not-working': 'Le code ne fonctionne pas',
  'cant-get-refund': 'Je ne parviens pas à me faire rembourser',
  'integrer-supprimer-pass': 'Comment intégrer ou supprimer des pass Sport dans LCA ?',
  'club-problème-lca': 'Je rencontre un problème sur mon compte LCA',
  other: 'Autre',
};

const initialInputsState: InputsState = {
  firstname: { state: 'default' },
  lastname: { state: 'default' },
  email: { state: 'default' },
  reason: { state: 'default' },
  message: { state: 'default' },
  consent: { state: 'default' },
  siret: { state: 'default' },
  rna: { state: 'default' },
};

export const mapper: Record<keyof InputsState, string> = {
  firstname: 'Le prénom est requis',
  lastname: 'Le nom de famille est requis',
  email: "L'email est requis",
  reason: "L'objet du message est requis",
  message: 'Le message est requis',
  consent: 'Veuiller cocher cette case',
  siret: 'Le SIRET est requis',
  rna: '',
};

interface Props {
  closeFn: VoidFunction;
  isProVersion: boolean;
}

const ContactForm = ({ closeFn, isProVersion }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<InputsState>(initialInputsState);
  const [apiError, setApiError] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [isOk, setIsOk] = useState<boolean>(false);

  const isFormValid = (formData: FormData): { isValid: boolean; states: InputsState } => {
    let isValid = true;

    const fieldNames: { name: keyof InputsState; isMandatory: boolean }[] = [
      { name: 'firstname', isMandatory: true },
      { name: 'lastname', isMandatory: true },
      { name: 'email', isMandatory: true },
      { name: 'reason', isMandatory: true },
      { name: 'message', isMandatory: true },
      { name: 'consent', isMandatory: true },
      { name: 'rna', isMandatory: false },
    ];

    if (isProVersion) {
      fieldNames.push({ name: 'siret', isMandatory: true });
      fieldNames.push({ name: 'rna', isMandatory: false });
    }

    const states = structuredClone(initialInputsState);

    fieldNames.forEach((fieldName) => {
      const value = formData.get(fieldName.name);

      if (fieldName.isMandatory && !value) {
        states[fieldName.name].state = 'error';
        states[fieldName.name].errorMsg = mapper[fieldName.name];
        isValid = false;
      }
    });

    const emailInput = formData.get('email') as string;

    if (states.email.state !== 'error' && !EMAIL_REGEX.test(emailInput)) {
      states.email.state = 'error';
      states.email.errorMsg = 'Format attendu : nom@domaine.fr';
      isValid = false;
    }

    if (isProVersion) {
      const siretInput = formData.get('siret') as string;
      const regExp = new RegExp('\\d{14}');
      if (states.siret.state !== 'error' && !regExp.test(siretInput)) {
        states.siret.state = 'error';
        states.siret.errorMsg = 'Le SIRET doit contenir 14 chiffres';
        isValid = false;
      }
    }

    if (isProVersion) {
      const rnaInput = formData.get('rna') as string;
      const regExp = new RegExp('W\\d{9}');
      if (rnaInput && states.rna.state !== 'error' && !regExp.test(rnaInput)) {
        states.rna.state = 'error';
        states.rna.errorMsg = "Le RNA doit être composé d'un W suivi de 9 chiffres";
        isValid = false;
      }
    }

    return { isValid, states };
  };

  const onInputChanged = (text: string | null, field: keyof InputsState) => {
    const form = formRef.current!;

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

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(formRef.current!);

    const { isValid, states } = isFormValid(formData);

    setInputStates({ ...states });

    if (!isValid) {
      // Go through each input, stops at the first one and focuses on it
      // Transform into map for iteration to preserve the order of the keys
      for (const [key, value] of new Map(Object.entries(states))) {
        if (value.state === 'error') {
          const invalidInput: HTMLInputElement | null | undefined = formRef.current?.querySelector(
            `[name="${key}"]`,
          );

          invalidInput?.focus();
          break;
        }
      }

      return;
    }

    try {
      const response = await postContact(formData, isProVersion);

      if (!response.ok) {
        setApiError(true);
        setIsError(true);
        setIsOk(false);
      } else {
        setApiError(false);
        setIsError(false);
        setIsOk(true);
        formRef.current?.reset();
      }
    } catch (e) {
      setApiError(true);
      setIsError(true);
      setIsOk(false);
    }
  };

  const reasons = isProVersion ? proReasons : visitorReasons;
  return (
    <>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <div>
          <h2 className="fr-text--bold fr-my-2w fr-h6">
            Avez-vous d&apos;abord consulté notre foire aux questions ?
          </h2>
          <p className="fr-mb-2w">
            La réponse à votre question s&apos;y trouve peut-être. Si tel est le cas, vous gagnerez
            certainement du temps grâce à elle.
          </p>

          <p className="fr-mb-2w">
            <Button
              type="button"
              onClick={() => {
                closeFn();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              priority="secondary"
            >
              Lire les questions fréquentes
            </Button>
          </p>
        </div>
        <div>
          <div className={styles.form}>
            <div>
              <p className={styles.paragraph}>Tous les champs ci-dessous sont obligatoires*</p>
            </div>
            <div className={styles['names-input-container']}>
              <div>
                <Input
                  label="Prénom*"
                  nativeInputProps={{
                    name: 'firstname',
                    onChange: (e: ChangeEvent<HTMLInputElement>) =>
                      onInputChanged(e.target.value, 'firstname'),
                    autoComplete: 'given-name',
                    required: true,
                  }}
                  state={inputStates.firstname.state}
                  stateRelatedMessage={inputStates.firstname.errorMsg}
                />
              </div>

              <div>
                <Input
                  label="Nom de famille*"
                  nativeInputProps={{
                    name: 'lastname',
                    onChange: (e: ChangeEvent<HTMLInputElement>) =>
                      onInputChanged(e.target.value, 'lastname'),
                    autoComplete: 'family-name',
                    required: true,
                  }}
                  state={inputStates.lastname.state}
                  stateRelatedMessage={inputStates.lastname.errorMsg}
                />
              </div>
            </div>
            {isProVersion && (
              <>
                <div>
                  <Input
                    label="Siret*"
                    nativeInputProps={{
                      name: 'siret',
                      onChange: (e: ChangeEvent<HTMLInputElement>) =>
                        onInputChanged(e.target.value, 'siret'),
                      required: true,
                    }}
                    state={inputStates.siret.state}
                    stateRelatedMessage={inputStates.siret.errorMsg}
                  />
                </div>

                <div>
                  <Input
                    label="RNA"
                    hintText="Le numéro RNA est le numéro d'identification du Répertoire National des Associations"
                    nativeInputProps={{
                      name: 'rna',
                      onChange: (e: ChangeEvent<HTMLInputElement>) =>
                        onInputChanged(e.target.value, 'rna'),
                    }}
                    state={inputStates.rna.state}
                    stateRelatedMessage={inputStates.rna.errorMsg}
                  />
                </div>
              </>
            )}

            <div>
              <Input
                label="Adresse e-mail*"
                nativeInputProps={{
                  name: 'email',
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    onInputChanged(e.target.value, 'email'),
                  autoComplete: 'email',
                  required: true,
                }}
                state={inputStates.email.state}
                stateRelatedMessage={inputStates.email.errorMsg}
                hintText="Format attendu : nom@domaine.fr"
              />
            </div>

            <div>
              <Select
                label="Objet de la demande*"
                nativeSelectProps={{
                  name: 'reason',
                  onChange: (e: SyntheticEvent<HTMLSelectElement>) =>
                    onInputChanged(e.currentTarget.value, 'reason'),
                  defaultValue: '',
                  required: true,
                }}
                state={inputStates.reason.state}
                stateRelatedMessage={inputStates.reason.errorMsg}
              >
                <React.Fragment key=".0">
                  <option disabled hidden value="">
                    Veuillez sélectionner un objet
                  </option>

                  {Object.entries(reasons).map(([key, value]) => (
                    <option value={key} key={`${isProVersion ? 'pro' : 'visitor'}_${key}`}>
                      {value}
                    </option>
                  ))}
                </React.Fragment>
              </Select>
            </div>

            <Input
              className={styles['textarea-wrapper']}
              textArea
              label="Message*"
              nativeTextAreaProps={{
                placeholder: 'Message*',
                name: 'message',
                onChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
                  onInputChanged(e.target.value, 'message'),
                required: true,
              }}
              state={inputStates.message.state}
              stateRelatedMessage={inputStates.message.errorMsg}
            />
          </div>
        </div>
        <div className="fr-mt-4w">
          <Checkbox
            options={[
              {
                label:
                  'En cochant cette case, vous comprenez que les données personnelles entrées, adresse IP comprise, pourront être utilisées afin de vous contacter dans le cadre de votre intérêt légitime.*',
                nativeInputProps: {
                  name: 'consent',
                  required: true,
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    onInputChanged(e.target.checked ? 'yes' : null, 'consent'),
                },
              },
            ]}
            state={inputStates.consent.state}
            stateRelatedMessage={inputStates.consent.errorMsg}
          />
        </div>
        <div className="fr-grid-row fr-grid-row--right">
          <Button
            className="fr-col-md-4 fr-col-12 fr-grid-row--center fr-mt-2w fr-mt-md-0"
            priority="primary"
            type="submit"
            iconPosition="right"
            iconId="fr-icon-send-plane-line"
          >
            Envoyer ma demande
          </Button>
        </div>
      </form>
      <div role="status">
        {apiError && (
          <Alert
            className="fr-mt-2w"
            severity="error"
            isClosed={!isError}
            onClose={() => setIsError(false)}
            title="Un problème est survenu"
            description="Veuillez réessayer plus tard"
            closable
          />
        )}
        {isOk && (
          <Alert
            className="fr-mt-2w"
            severity="success"
            title="Votre demande à bien été envoyée"
            description="Votre message nous a bien été transmis."
            closable
          />
        )}
      </div>
    </>
  );
};

export default ContactForm;
