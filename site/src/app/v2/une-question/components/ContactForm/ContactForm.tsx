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
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';
import { useSearchParams } from 'next/navigation';

export const visitorReasons = {
  'benef-incident-securite-18-decembre': `J'ai une question sur la sécurité de mes données personnelles suite à l'incident du 18 décembre`,
  'code-pas-reçu': "Je n'ai pas reçu mon code pass Sport",
  'ars-non-eligible':
    'Je perçois l’ARS pour mon enfant de moins de 14 ans. Pourquoi je n’ai pas reçu le code ?',
  'non-eligible': 'Pourquoi je n’ai plus droit au pass Sport cette année ?',
  'eligibility-test-fail': `Le formulaire me dit "Les informations que vous avez fournies ne correspondent pas à nos données"`,
  'fratrie-code-manquant': "Il manque le pass Sport d'un ou plusieurs de mes enfants",
  'aije-droit': 'Suis-je éligible ?',
  boursier: 'Je suis boursier ou boursière',
  'club-wait-70': "Mon club attend d'être remboursé avant de me faire la déduction de 70 euros",
  'deja-paye-comment-rembourse':
    "j'ai déjà payé mon adhésion, comment me faire rembourser mon pass Sport ?",
  'club-pas-trouvé': 'Je ne trouve pas mon club dans la liste des partenaires',
  'refus-code-club': 'Mon club ne prend pas le pass Sport',
  'aeeh-eligible': 'Mon enfant a entre 6 et 13 ans et bénéficie de l’AEEH',
  other: 'Autre',
};

const proReasons = {
  'club-incident-securite-18-decembre': `J'ai une question sur la sécurité des données de mon club sur mon Compte Asso suite à l'incident du 18 décembre`,
  'what-pass': "Qu'est-ce que le pass Sport ?",
  'devenir-partenaire': 'Comment devenir partenaire ?',
  'club-code-not-working': 'Le code ne fonctionne pas',
  'cant-get-refund': 'Je ne parviens pas à me faire rembourser',
  'integrer-supprimer-pass': 'Comment intégrer ou supprimer des pass Sport dans LCA ?',
  'club-problème-lca': 'Je rencontre un problème sur mon compte LCA',
  other: 'Autre',
};

const initialInputsState: InputsState = {
  firstname: { state: 'default', errorMsg: '' },
  lastname: { state: 'default', errorMsg: '' },
  email: { state: 'default', errorMsg: '' },
  reason: { state: 'default', errorMsg: '' },
  message: { state: 'default', errorMsg: '' },
  consent: { state: 'default', errorMsg: '' },
  siret: { state: 'default', errorMsg: '' },
  rna: { state: 'default', errorMsg: '' },
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

const SIRET_REGEX = new RegExp('\\d{14}');
const SIRET_FORMAT_ERROR_MSG = 'Le SIRET doit contenir 14 chiffres.';

interface Props {
  closeFn: VoidFunction;
  isProVersion: boolean;
}

const ContactForm = ({ closeFn, isProVersion }: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<InputsState>(initialInputsState);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [isOk, setIsOk] = useState<boolean>(false);
  const searchParams = useSearchParams();
  const segmentValue = searchParams?.get(CONTACT_PAGE_QUERYPARAMS.segment) || '';

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
      states.email.errorMsg = `L'adresse email saisie n'est pas valide (exemple valide : nom@domaine.fr).`;
      isValid = false;
    }

    if (isProVersion) {
      const siretInput = formData.get('siret') as string;
      if (states.siret.state !== 'error' && !SIRET_REGEX.test(siretInput)) {
        states.siret.state = 'error';
        states.siret.errorMsg = SIRET_FORMAT_ERROR_MSG;
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

  const onInputChanged = (text: string, field: keyof InputsState) => {
    setInputStates((inputStates) => ({
      ...inputStates,
      [`${field}`]:
        text !== ''
          ? { state: 'default', errorMsg: '' }
          : { state: 'error', errorMsg: mapper[field] },
    }));
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
      setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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
          <p className="fr-mb-2w">La réponse à votre question s&apos;y trouve peut-être.</p>
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
                      Prénom <span className="text--required">*</span>
                    </>
                  }
                  nativeInputProps={{
                    name: 'firstname',
                    onBlur: (e) => {
                      const inputIsValid = !!e.target?.checkValidity();

                      setInputStates({
                        ...inputStates,
                        firstname: {
                          state: inputIsValid ? 'default' : 'error',
                          errorMsg: !inputIsValid ? mapper['firstname'] : '',
                        },
                      });
                    },
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
                      Nom de famille <span className="text--required">*</span>
                    </>
                  }
                  nativeInputProps={{
                    name: 'lastname',
                    onBlur: (e) => {
                      const inputIsValid = !!e.target?.checkValidity();

                      setInputStates({
                        ...inputStates,
                        lastname: {
                          state: inputIsValid ? 'default' : 'error',
                          errorMsg: !inputIsValid ? mapper['lastname'] : '',
                        },
                      });
                    },
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
                    label={
                      <>
                        Siret <span className="text--required">*</span>
                      </>
                    }
                    nativeInputProps={{
                      onBlur: (e) => {
                        const siretIsValid = SIRET_REGEX.test(e.target.value);

                        let errorMsg =
                          e.target.value === ''
                            ? mapper['siret']
                            : !siretIsValid
                              ? SIRET_FORMAT_ERROR_MSG
                              : '';

                        setInputStates({
                          ...inputStates,
                          siret: {
                            state: errorMsg === '' ? 'default' : 'error',
                            errorMsg,
                          },
                        });
                      },
                      name: 'siret',
                      onChange: (e: ChangeEvent<HTMLInputElement>) =>
                        onInputChanged(e.target.value, 'siret'),
                      required: true,
                    }}
                    state={inputStates.siret.state}
                    stateRelatedMessage={inputStates.siret.errorMsg}
                    hintText="Format attendu: Le SIRET doit contenir 14 chiffres"
                  />
                </div>

                <div>
                  <Input
                    label="RNA"
                    hintText="Format attendu: Le numéro RNA est le numéro d'identification du Répertoire National des Associations"
                    nativeInputProps={{
                      name: 'rna',
                      onBlur: (e) => {
                        const inputIsValid = !!e.target?.checkValidity();

                        setInputStates({
                          ...inputStates,
                          rna: {
                            state: inputIsValid ? 'default' : 'error',
                            errorMsg: !inputIsValid ? mapper['rna'] : '',
                          },
                        });
                      },
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
                label={
                  <>
                    Adresse e-mail <span className="text--required">*</span>
                  </>
                }
                nativeInputProps={{
                  name: 'email',
                  type: 'email',
                  onBlur: (e) => {
                    const inputIsValid = !!e.target?.checkValidity();

                    const errorMessage =
                      e.target.value === ''
                        ? mapper['email']
                        : !EMAIL_REGEX.test(e.target.value)
                          ? `L'adresse email saisie n'est pas valide (exemple valide : nom@domaine.fr).`
                          : mapper['email'];

                    setInputStates({
                      ...inputStates,
                      email: {
                        state: inputIsValid ? 'default' : 'error',
                        errorMsg: !inputIsValid ? errorMessage : '',
                      },
                    });
                  },
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
                label={
                  <>
                    Objet de la demande <span className="text--required">*</span>
                  </>
                }
                nativeSelectProps={{
                  name: 'reason',
                  onBlur: (e) => {
                    const inputIsValid = !!e.target?.checkValidity();

                    setInputStates({
                      ...inputStates,
                      reason: {
                        state: inputIsValid ? 'default' : 'error',
                        errorMsg: !inputIsValid ? mapper['reason'] : '',
                      },
                    });
                  },
                  onChange: (e: SyntheticEvent<HTMLSelectElement>) =>
                    onInputChanged(e.currentTarget.value, 'reason'),
                  defaultValue: segmentValue in reasons ? segmentValue : '',
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
              label={
                <>
                  Message <span className="text--required">*</span>
                </>
              }
              nativeTextAreaProps={{
                placeholder: 'Message*',
                name: 'message',
                onBlur: (e) => {
                  const inputIsValid = !!e.target?.checkValidity();

                  setInputStates({
                    ...inputStates,
                    message: {
                      state: inputIsValid ? 'default' : 'error',
                      errorMsg: !inputIsValid ? mapper['message'] : '',
                    },
                  });
                },
                onChange: (e: ChangeEvent<HTMLTextAreaElement>) =>
                  onInputChanged(e.target.value, 'message'),
                required: true,
              }}
              state={inputStates.message.state}
              stateRelatedMessage={inputStates.message.errorMsg}
            />
          </div>
        </div>
        {/* todo: Check why checkbox is not triggered properly (click on it multiple times to replicate) */}
        <div className="fr-mt-4w">
          <Checkbox
            options={[
              {
                label:
                  'En cochant cette case, vous comprenez que les données personnelles entrées, adresse IP comprise, pourront être utilisées afin de vous contacter dans le cadre de votre intérêt légitime. *',
                nativeInputProps: {
                  name: 'consent',
                  required: true,
                  onBlur: (e) => onInputChanged(e.target.checked ? 'yes' : '', 'consent'),
                  onChange: (e) => onInputChanged(e.target.checked ? 'yes' : '', 'consent'),
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
            disabled={isLoading}
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
