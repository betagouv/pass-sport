'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ALLOWANCE } from '../types/types';
import MergedEligibilityForm from '../merged-eligibility-form/MergedEligibilityForm';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import CustomRadioButtons from '@/app/v2/test-eligibilite-base/components/customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import cn from 'classnames';
import styles from './styles.module.scss';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import { ConfirmResponseBody, SearchResponseBody } from '@/types/EligibilityTest';
import Input from '@codegouvfr/react-dsfr/Input';
import {
  ALLOCATION_MAPPING_TO_ALLOWANCE,
  ALLOCATIONS_WITH_CAISSE,
  ALLOWANCE_MAPPING_TO_ALLOCATION,
  CAISSE,
  isEligible,
} from '@/utils/eligibility-test';
import RadioButtons from '@codegouvfr/react-dsfr/RadioButtons';
import { useEligibilityTestStorage } from '@/app/hooks/use-eligibility-test-storage';
import { useAskConsentForSupport } from '@/app/v2/test-eligibilite/hooks/use-ask-consent-for-support';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { CODES_OBTAINABLE_FOR_CROUS } from '@/app/constants/env';
import { InputState } from '@/types/form';

/* This is a trick to force the RadioButtonsGroup to reload */
let CustomButtonsGroupKey = 0;

type AllowanceFormInputsState = {
  dob: InputState;
  allowance: InputState;
  caisse: InputState;
};

const errorMapper: Record<keyof AllowanceFormInputsState, string> = {
  dob: 'La date de naissance est invalide',
  allowance: 'Le choix de la situation est requise',
  caisse: 'Le choix de la caisse est requis',
};

const initialInputsState: AllowanceFormInputsState = {
  dob: { state: 'default' },
  allowance: { state: 'default' },
  caisse: { state: 'default' },
};

const AllowanceStep = () => {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setPspCodeData] = useState<ConfirmResponseBody | null>(null);
  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);
  const [caisse, setCaisse] = useState<CAISSE | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [inputStates, setInputStates] = useState<AllowanceFormInputsState>(initialInputsState);

  // isValidated is a variable to know whether the user has clicked on the submit button
  const [isValidated, setIsValidated] = useState<boolean | null>(null);
  const dobId = 'dob-id';
  const [benefIsEligible, setBenefIsEligible] = useState<boolean>(false);
  const [dob, setDob] = useState<string>('');
  const fieldsetId = 'allowanceStep-fieldset';
  const caisseFieldsetId = 'caisseStep-fieldset';
  const { stored, save, clear } = useEligibilityTestStorage();
  const isBoursier =
    allowance === ALLOWANCE.CROUS || allowance === ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX;
  const isCaisseNeeded =
    allowance !== null &&
    ALLOCATIONS_WITH_CAISSE.includes(ALLOWANCE_MAPPING_TO_ALLOCATION[allowance]);

  useRemoveAttributeById(fieldsetId, 'aria-labelledby');
  useAskConsentForSupport();

  // Prefill from whatever the simplified test on the landing pages already collected
  useEffect(() => {
    if (!stored) return;

    if (stored.dob) {
      setDob(stored.dob);
    }

    if (stored.situation) {
      setAllowance(ALLOCATION_MAPPING_TO_ALLOWANCE[stored.situation]);
    }

    if (stored.caisse) {
      setCaisse(stored.caisse);
    }
  }, [stored]);

  useEffect(() => {
    // Skip the mount pass and the restart reset, otherwise a previously stored entry gets wiped
    if (!dob && allowance === null) {
      return;
    }

    save({
      dob: dob || null,
      situation: allowance === null ? null : ALLOWANCE_MAPPING_TO_ALLOCATION[allowance],
      caisse: isCaisseNeeded ? caisse : null,
    });
  }, [dob, allowance, caisse, isCaisseNeeded, save]);

  useEffect(() => {
    formRef.current?.querySelector<HTMLInputElement>(`#${dobId}`)?.focus();
  }, []);

  // "Refaire le test": full wipe, storage included, so a later visit doesn't prefill the old answers
  const restartTest = () => {
    CustomButtonsGroupKey = Math.round(Math.random() * 1000);
    setAllowance(null);
    setCaisse(null);
    setIsValidated(null);
    setEligibilityData(null);
    setPspCodeData(null);
    setDob('');
    clear();
  };

  const selectAllowance = (value: ALLOWANCE) => {
    setIsValidated(false);
    setAllowance(value);

    if (!ALLOCATIONS_WITH_CAISSE.includes(ALLOWANCE_MAPPING_TO_ALLOCATION[value])) {
      setCaisse(null);
    }
  };

  // "Modifier": reopen the form on the answers already given instead of starting over
  const editTest = () => {
    setIsValidated(null);
    setEligibilityData(null);
    setPspCodeData(null);
  };

  const onSubmitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const isCaisseMissing = isCaisseNeeded && !caisse;

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
      caisse: {
        state: isCaisseMissing ? 'error' : 'default',
        errorMsg: errorMapper['caisse'],
      },
    });

    if (dob && allowance && !isCaisseMissing) {
      setIsValidated(true);
    } else {
      setIsValidated(false);

      if (!dob) {
        formRef?.current?.querySelector<HTMLInputElement>(`#${dobId}`)?.focus();
      } else if (!allowance) {
        formRef?.current?.querySelector<HTMLInputElement>(`#${fieldsetId}`)?.focus();
      } else {
        formRef?.current?.querySelector<HTMLInputElement>(`#${caisseFieldsetId}`)?.focus();
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
      case ALLOWANCE.QF:
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
        caisse,
        benefIsEligible,
        dob,
        eligibilityData,
        pspCodeData,
        performNewTest: restartTest,
        portalNode,
        setPortalNode,
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
            <StepChecker title={`Vous ne bénéficiez d'aucune aide`} onClick={editTest} />
          )}

          {(isValidated && benefIsEligible) || (ALLOWANCE.NONE && isValidated) ? (
            getStepCheckerName() ? (
              <StepChecker title={getStepCheckerName()} onClick={editTest} />
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
                  autoFocus: true,
                  id: dobId,
                  type: 'date',
                  min: '1950-01-01',
                  max: '2099-12-31',
                  required: true,
                  value: dob,
                  onBlur: (e) => {
                    if (!e.target.value) return;

                    const inputIsValid = e.target?.checkValidity();

                    setInputStates({
                      ...inputStates,
                      dob: {
                        state: inputIsValid ? 'default' : 'error',
                        errorMsg: !inputIsValid ? errorMapper['dob'] : '',
                      },
                    });
                  },
                  onChange: (e) => {
                    setDob(e.target.value ?? '');
                  },
                }}
                hintText="Exemple : 31/12/2026, Personne à qui le pass Sport est destiné."
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
                    Le bénéficiaire est-il concerné par l’une de ces situations ?{' '}
                    <span className="text--required">*</span>
                  </>
                }
                key={CustomButtonsGroupKey}
                options={[
                  {
                    label: (
                      <p className="fr-text--bold">
                        Quotient familial inférieur à 700
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0"></span>
                      </p>
                    ),
                    nativeInputProps: {
                      checked: allowance === ALLOWANCE.QF,
                      onChange: () => selectAllowance(ALLOWANCE.QF),
                    },
                  },
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
                      checked: allowance === ALLOWANCE.AAH,
                      onChange: () => selectAllowance(ALLOWANCE.AAH),
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
                      checked: allowance === ALLOWANCE.AEEH,
                      onChange: () => selectAllowance(ALLOWANCE.AEEH),
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
                      checked: allowance === ALLOWANCE.CROUS,
                      onChange: () => selectAllowance(ALLOWANCE.CROUS),
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
                      checked: allowance === ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX,
                      onChange: () => selectAllowance(ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX),
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
                      checked: allowance === ALLOWANCE.NONE,
                      onBlur: (e) => {
                        const inputIsValid = e.target?.checkValidity();

                        setInputStates({
                          ...inputStates,
                          allowance: {
                            state: inputIsValid ? 'default' : 'error',
                            errorMsg: !inputIsValid ? errorMapper['allowance'] : '',
                          },
                        });
                      },
                      onChange: () => selectAllowance(ALLOWANCE.NONE),
                    },
                  },
                ]}
              >
                {isCaisseNeeded && (
                  <RadioButtons
                    id={caisseFieldsetId}
                    className="fr-mt-3w"
                    name="caisse"
                    state={inputStates.caisse.state}
                    stateRelatedMessage={inputStates.caisse.errorMsg}
                    legend={
                      <>
                        À quelle caisse l’allocataire est-il affilié ?{' '}
                        <span className="text--required">*</span>
                      </>
                    }
                    options={[
                      {
                        label: 'CAF (Caisse d’Allocations Familiales)',
                        nativeInputProps: {
                          checked: caisse === CAISSE.CAF,
                          onChange: () => {
                            setIsValidated(false);
                            setCaisse(CAISSE.CAF);
                          },
                        },
                      },
                      {
                        label: 'MSA (Mutualité Sociale Agricole)',
                        nativeInputProps: {
                          checked: caisse === CAISSE.MSA,
                          onChange: () => {
                            setIsValidated(false);
                            setCaisse(CAISSE.MSA);
                          },
                        },
                      },
                    ]}
                  />
                )}
              </CustomRadioButtons>
            </form>
          )}

          {isValidated &&
            benefIsEligible &&
            allowance !== null &&
            allowance !== ALLOWANCE.NONE &&
            (isBoursier ? CODES_OBTAINABLE_FOR_CROUS : true) && <MergedEligibilityForm />}
        </div>
      </div>

      <div ref={setPortalNode}>
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

        {isValidated && allowance && dob && !benefIsEligible && (
          <VerdictPanel isSuccess={false} isEligible={benefIsEligible} />
        )}
      </div>
    </EligibilityTestContext.Provider>
  );
};

export default AllowanceStep;
