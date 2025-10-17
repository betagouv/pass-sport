'use client';

import { FormEvent, useCallback, useRef, useState } from 'react';
import { ALLOWANCE } from '../types/types';
import EligibilityTestForms from '../eligibility-test-forms/EligibilityTestForms';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import CustomRadioButtons from '@/app/v2/test-eligibilite-base/components/customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import CrousEligibilityTestForms from '@/app/v2/test-eligibilite/components/crous-eligibility-test-forms/CrousEligibilityTestForms';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import cn from 'classnames';
import styles from './styles.module.scss';
import { RadioButtonsProps } from '@codegouvfr/react-dsfr/RadioButtons';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import { ConfirmResponseBody, SearchResponseBody } from '@/types/EligibilityTest';
import Input, { InputProps } from '@codegouvfr/react-dsfr/Input';
import {
  AEEH_CODE_OBTENTION_TYPE,
  ALLOWANCE_MAPPING_TO_ALLOCATION,
  getAeehCodeObtentionType,
  isEligible,
} from '@/utils/eligibility-test';
import { useAskConsentForSupport } from '@/app/v2/test-eligibilite/hooks/use-ask-consent-for-support';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { CODES_OBTAINABLE, CODES_OBTAINABLE_FOR_CROUS } from '@/app/constants/env';
import ContactAeehSection from '@/app/v2/jeunes-et-parents/components/ContactAeehSection';
import { push } from '@socialgouv/matomo-next';
import { InputState } from '@/types/form';

/* This is a trick to force the RadioButtonsGroup to reload */
let CustomButtonsGroupKey = 0;

type AllowanceFormInputsState = {
  dob: InputState;
  allowance: InputState;
};

const errorMapper: Record<keyof AllowanceFormInputsState, string> = {
  dob: 'La date de naissance est invalide',
  allowance: "Le choix de l'allocation est requise",
};

const initialInputsState: AllowanceFormInputsState = {
  dob: { state: 'default' },
  allowance: { state: 'default' },
};

const AllowanceStep = () => {
  const portalRef = useRef<HTMLDivElement>(null);
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setPspCodeData] = useState<ConfirmResponseBody | null>(null);
  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);
  const [, setOriginalAllowance] = useState<ALLOWANCE | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<AllowanceFormInputsState>(initialInputsState);

  // isValidated is a variable to know whether the user has clicked on the submit button
  const [isValidated, setIsValidated] = useState<boolean | null>(null);
  const dobId = 'dob-id';
  const [benefIsEligible, setBenefIsEligible] = useState<boolean>(false);
  const [dob, setDob] = useState<string | undefined>(undefined);
  const fieldsetId = 'allowanceStep-fieldset';

  const onAeehFormClick = useCallback(() => {
    push(['trackEvent', 'Eligibility Test', 'Clicked', 'Button to open AEEH form']);
  }, []);

  useRemoveAttributeById(fieldsetId, 'aria-labelledby');
  useAskConsentForSupport();

  const restartTest = () => {
    CustomButtonsGroupKey = Math.round(Math.random() * 1000);
    setAllowance(null);
    setIsValidated(null);
    setEligibilityData(null);
    setPspCodeData(null);
    setDob(undefined);
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setInputStates({
      ...inputStates,
      dob: {
        state: !dob ? 'error' : 'default',
        errorMsg: errorMapper['dob'],
      },
      allowance: {
        state: !allowance ? 'error' : 'default',
        errorMsg: errorMapper['allowance'],
      },
    });

    if (dob && allowance) {
      setIsValidated(true);
    } else {
      setIsValidated(false);

      if (!dob) {
        formRef?.current?.querySelector<HTMLInputElement>(`#${dobId}`)?.focus();
      } else {
        formRef?.current?.querySelector<HTMLInputElement>(`#${fieldsetId}`)?.focus();
      }
    }

    // Set benef eligibility
    if (!dob || allowance === null) {
      setBenefIsEligible(false);
    } else {
      setBenefIsEligible(
        isEligible({
          targetDate: dob,
          allocationName: ALLOWANCE_MAPPING_TO_ALLOCATION[allowance],
        }),
      );
    }
  };

  const getStepCheckerName = useCallback(() => {
    switch (allowance) {
      case ALLOWANCE.AAH:
      case ALLOWANCE.AEEH:
      case ALLOWANCE.ARS:
      case ALLOWANCE.CROUS:
      case ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX:
        return 'Vos informations d’éligibilité';
      default:
        return '';
    }
  }, [allowance]);

  return (
    <EligibilityTestContext.Provider
      value={{
        allowance,
        benefIsEligible,
        dob,
        eligibilityData,
        pspCodeData,
        performNewTest: restartTest,
        portalRef,
        setAllowance,
        setBenefIsEligible,
        setEligibilityData,
        setPspCodeData,
      }}
    >
      <div className={cn(styles.background)}>
        <div className={styles.wrapper}>
          <h2 className="fr-text--bold fr-mb-2w fr-text--xl">Quelle est votre situation ?</h2>
          {(!isValidated || !benefIsEligible) && (
            <>
              <span className="text--italic">
                Tous les champs ci-dessous sont obligatoires{' '}
                <span className="text--required">*</span>
              </span>
              <h3 className="fr-mt-1w fr-mb-2w fr-text--md fr-text--regular">
                Ces informations nous aideront à connaître votre éligibilité.
              </h3>
            </>
          )}

          {isValidated && allowance === ALLOWANCE.NONE && (
            <StepChecker title={`Vous ne bénéficiez d'aucune aide`} onClick={restartTest} />
          )}

          {(isValidated && benefIsEligible) || (ALLOWANCE.NONE && isValidated) ? (
            getStepCheckerName() ? (
              <StepChecker title={getStepCheckerName()} onClick={restartTest} />
            ) : null
          ) : (
            <form ref={formRef} onSubmit={onSubmitHandler}>
              <Input
                label={
                  <>
                    Date de naissance du bénéficiaire <span className="text--required">*</span>
                  </>
                }
                nativeInputProps={{
                  id: dobId,
                  type: 'date',
                  min: '1950-01-01',
                  max: '2099-12-31',
                  required: true,
                  value: dob,
                  autoFocus: true,
                  onBlur: (e) => {
                    const inputIsValid = !!e.target?.checkValidity();

                    setInputStates({
                      ...inputStates,
                      dob: {
                        state: inputIsValid ? 'default' : 'error',
                        errorMsg: !inputIsValid ? errorMapper['dob'] : '',
                      },
                    });
                  },
                  onChange: (e) => {
                    setDob(e.target.value ?? undefined);
                  },
                }}
                hintText="Format attendu : DD/MM/YYYY, Personne à qui le pass Sport est destiné."
                state={inputStates.dob.state}
                stateRelatedMessage={inputStates.dob.errorMsg}
              />
              <CustomRadioButtons
                id={fieldsetId}
                state={inputStates.allowance.state}
                stateRelatedMessage={inputStates.allowance.errorMsg}
                name="radio"
                legend={
                  <>
                    Le bénéficiaire est-il concerné par l’une de ces allocations ?{' '}
                    <span className="text--required">*</span>
                  </>
                }
                key={CustomButtonsGroupKey}
                options={[
                  {
                    label: (
                      <p className="fr-text--bold">
                        AAH
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Allocation Adulte Handicapé
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.AAH);
                        setOriginalAllowance(ALLOWANCE.AAH);
                      },
                    },
                  },
                  {
                    label: (
                      <p className="fr-text--bold">
                        AEEH
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Allocation d’Éducation de l’Enfant Handicapé
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.AEEH);
                        setOriginalAllowance(ALLOWANCE.AEEH);
                      },
                    },
                  },
                  {
                    label: (
                      <p className="fr-text--bold">
                        ARS
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Allocation de Rentrée Scolaire
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.ARS);
                        setOriginalAllowance(ALLOWANCE.ARS);
                      },
                    },
                  },
                  {
                    label: (
                      <p className="fr-text--bold">
                        Étudiant boursier du CROUS
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Bourse annuelle du CROUS pour l&apos;enseignement supérieur
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.CROUS);
                        setOriginalAllowance(ALLOWANCE.CROUS);
                      },
                    },
                  },
                  {
                    label: (
                      <p className="fr-text--bold">
                        Étudiant boursier en formation sanitaire et sociale
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Bourse régionale pour la formation sanitaire et sociale
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX);
                        setOriginalAllowance(ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX);
                      },
                    },
                  },
                  {
                    label: (
                      <p className="fr-text--bold">
                        Aucune
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Aucune de ces propositions
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onBlur: (e) => {
                        const inputIsValid = !!e.target?.checkValidity();

                        setInputStates({
                          ...inputStates,
                          allowance: {
                            state: inputIsValid ? 'default' : 'error',
                            errorMsg: !inputIsValid ? errorMapper['allowance'] : '',
                          },
                        });
                      },
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.NONE);
                        setOriginalAllowance(ALLOWANCE.NONE);
                      },
                    },
                  },
                ]}
              />
            </form>
          )}

          {isValidated && benefIsEligible && (
            <>
              {allowance && [ALLOWANCE.ARS, ALLOWANCE.AAH].includes(allowance) && (
                <EligibilityTestForms />
              )}

              {allowance === ALLOWANCE.AEEH &&
                dob &&
                getAeehCodeObtentionType(dob).displayType === AEEH_CODE_OBTENTION_TYPE.FORM && (
                  <EligibilityTestForms />
                )}

              {(allowance === ALLOWANCE.CROUS ||
                allowance === ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX) &&
                CODES_OBTAINABLE_FOR_CROUS && <CrousEligibilityTestForms />}
            </>
          )}
        </div>
      </div>

      <div ref={portalRef}>
        {isValidated &&
          benefIsEligible &&
          (allowance === ALLOWANCE.CROUS ||
            allowance === ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX) &&
          !CODES_OBTAINABLE_FOR_CROUS && (
            <div
              style={{
                maxWidth: 792,
                margin: '0 auto 24px auto',
              }}
            >
              {allowance === ALLOWANCE.CROUS ? (
                <Alert
                  severity="info"
                  title="Les étudiants boursiers de l'enseignement supérieur recevront leur code par courriel entre le 9 octobre et le 15 novembre."
                  description={
                    <p>
                      Si vous n&apos;avez pas reçu votre code d&apos;ici le 15 novembre, vous
                      pourrez venir le récupérer sur le site du pass Sport.
                    </p>
                  }
                />
              ) : (
                <Alert
                  severity="info"
                  title="Les étudiants boursiers des formations sanitaires et sociales recevront leur code par courriel entre le 9 octobre et le 15 novembre."
                  description={
                    <p>
                      Si vous n&apos;avez pas reçu votre code d&apos;ici le 15 novembre, vous
                      pourrez venir le récupérer sur le site du pass Sport.
                    </p>
                  }
                />
              )}
            </div>
          )}

        {isValidated &&
          benefIsEligible &&
          allowance === ALLOWANCE.AEEH &&
          dob &&
          getAeehCodeObtentionType(dob).displayType === AEEH_CODE_OBTENTION_TYPE.LINK && (
            <section style={{ maxWidth: 792, margin: '0 auto 72px auto' }}>
              <Alert
                severity="info"
                title="Bonne nouvelle, d'après les informations que vous avez fournies, vous êtes éligible au pass Sport"
                aria-live="polite"
                description="Remplissez le formulaire de demande du pass Sport pour obtenir votre code, à l’aide du lien ci-dessous."
              />

              {CODES_OBTAINABLE && (
                <>
                  <div className="fr-my-3w">
                    <ContactAeehSection onOpenBtnClick={onAeehFormClick} />
                  </div>

                  <p>
                    Dans l&apos;attente du code, vous pouvez proposer cette solution à votre club :
                  </p>

                  <ul className="fr-ml-2w">
                    <li>Régler l&apos;inscription avec la déduction immédiate de 70 € ;</li>
                    <li>
                      Fournir un chèque de 70 € (non encaissé), restitué dès réception du code pass
                      Sport.
                    </li>
                  </ul>

                  <p>
                    Si vous n’êtes finalement pas éligible, le club pourra encaisser le chèque.
                    Chaque club reste libre d’accepter ou non cette solution.
                  </p>
                </>
              )}
            </section>
          )}

        {isValidated && allowance && dob && !benefIsEligible && (
          <VerdictPanel isSuccess={false} isEligible={benefIsEligible} />
        )}
      </div>
    </EligibilityTestContext.Provider>
  );
};

export default AllowanceStep;
