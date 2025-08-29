'use client';

import { Alert } from '@codegouvfr/react-dsfr/Alert';
import Button from '@codegouvfr/react-dsfr/Button';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import Input from '@codegouvfr/react-dsfr/Input';
import React, { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { InputsStateBenef } from '@/types/Contact';
import { postContact } from '../../../une-question/client-agent';
import styles from './styles.module.scss';
import { EMAIL_REGEX } from '@/utils/email';
import { AEEH } from '@/app/v2/accueil/components/acronymes/Acronymes';

const aeehReasons = {
  'demande-code-aeeh': `demande-code-aeeh`,
};

const initialInputsState: InputsStateBenef = {
  firstname: { state: 'default' },
  lastname: { state: 'default' },
  email: { state: 'default' },
  reason: { state: 'default' },
  message: { state: 'default' },
  consent: { state: 'default' },
};

export const mapper: Record<keyof InputsStateBenef, string> = {
  firstname: 'Le prénom est requis',
  lastname: 'Le nom de famille est requis',
  email: "L'email est requis",
  reason: "L'objet du message est requis",
  message: 'Le message est requis',
  consent: 'Veuiller cocher cette case',
};

interface Props {
  closeFn: VoidFunction;
}

const ContactFormAeeh = ({ closeFn }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<InputsStateBenef>(initialInputsState);
  const [apiError, setApiError] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [isOk, setIsOk] = useState<boolean>(false);

  const isFormValid = (formData: FormData): { isValid: boolean; states: InputsStateBenef } => {
    let isValid = true;

    const fieldNames: { name: keyof InputsStateBenef; isMandatory: boolean }[] = [
      { name: 'firstname', isMandatory: true },
      { name: 'lastname', isMandatory: true },
      { name: 'email', isMandatory: true },
      { name: 'reason', isMandatory: true },
      { name: 'message', isMandatory: true },
      { name: 'consent', isMandatory: true },
    ];

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

    return { isValid, states };
  };

  const onInputChanged = (text: string | null, field: keyof InputsStateBenef) => {
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

    formData.set('reason', aeehReasons['demande-code-aeeh']);

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
      const response = await postContact(formData, false);

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

  return (
    <>
      <form ref={formRef} onSubmit={onSubmitHandler}>
        <p className="fr-my-2w">
          Si votre enfant a moins de 13 ans et bénéficie de l&apos;
          <AEEH />, il vous faut compléter et envoyer le formulaire ci-dessous pour que son code
          pass Sport vous soit transmis.
        </p>
        <div>
          <div className={styles.form}>
            <div>
              <p className={styles.paragraph}>
                Tous les champs ci-dessous sont obligatoires{' '}
                <span className="text--required">*</span>
              </p>
            </div>
            <div className={styles['names-input-container']}>
              <div>
                <Input
                  label={
                    <>
                      Prénom du parent <span className="text--required">*</span>
                    </>
                  }
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
                  label={
                    <>
                      Nom de famille du parent <span className="text--required">*</span>
                    </>
                  }
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

            <div>
              <Input
                label={
                  <>
                    Adresse courriel <span className="text--required">*</span>
                  </>
                }
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

            <Input
              className={styles['textarea-wrapper']}
              textArea
              label={
                <>
                  Message <span className="text--required">*</span>
                </>
              }
              hintText="Merci de nous indiquer le nom, le prénom et la date de naissance de votre enfant."
              nativeTextAreaProps={{
                placeholder: 'Message *',
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
                  'En cochant cette case, vous comprenez que les données personnelles entrées, adresse IP comprise, pourront être utilisées afin de vous contacter dans le cadre de votre intérêt légitime. *',
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

export default ContactFormAeeh;
