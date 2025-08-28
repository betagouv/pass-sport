'use client';

import { useCallback, useRef, useState } from 'react';
import { ALLOWANCE } from '../types/types';
import EligibilityTestForms from '../eligibility-test-forms/EligibilityTestForms';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import CustomRadioButtons from '@/app/v2/test-eligibilite-base/components/customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import CrousEligibilityTestForms from '@/app/v2/test-eligibilite/components/crous-eligibility-test-forms/CrousEligibilityTestForms';
import { StepChecker } from '@/app/v2/test-eligibilite/components/step-checker/StepChecker';
import Link from 'next/link';
import { JEUNES_PARENTS_PAGE_AEEH_PARAMS } from '@/app/constants/search-query-params';
import cn from 'classnames';
import styles from './styles.module.scss';
import { RadioButtonsProps } from '@codegouvfr/react-dsfr/RadioButtons';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import { ConfirmResponseBody, SearchResponseBody } from '@/types/EligibilityTest';
import CorrectiveInfo from '@/app/v2/test-eligibilite/components/corrective-info/CorrectiveInfo';
import Input, { InputProps } from '@codegouvfr/react-dsfr/Input';
import {
  AEEH_CODE_OBTENTION_TYPE,
  ALLOWANCE_MAPPING_TO_ALLOCATION,
  getAeehCodeObtentionType,
  isEligible,
} from '@/utils/eligibility-test';
import { useAskConsentForSupport } from '@/app/v2/test-eligibilite/hooks/use-ask-consent-for-support';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { CODES_OBTAINABLE_FOR_CROUS } from '@/app/constants/env';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

/* This is a trick to force the RadioButtonsGroup to reload */
let CustomButtonsGroupKey = 0;

const AllowanceStep = () => {
  const portalRef = useRef<HTMLDivElement>(null);
  const [eligibilityData, setEligibilityData] = useState<SearchResponseBody | null>(null);
  const [pspCodeData, setPspCodeData] = useState<ConfirmResponseBody | null>(null);
  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);
  const [originalAllowance, setOriginalAllowance] = useState<ALLOWANCE | null>(null);

  // isValidated is a variable to know whether the user has clicked on the submit button
  const [isValidated, setIsValidated] = useState<boolean | null>(null);

  const [radioButtonsState, setRadioButtonsState] = useState<RadioButtonsProps['state']>('default');
  const radioButtonsStateRelatedMessage =
    radioButtonsState === 'error' ? `Le choix de l'allocation est requise` : '';

  const [dobState, setDobState] = useState<InputProps['state']>('default');
  const dobStateRelatedMessages = dobState === 'error' ? 'La date de naissance est requise' : '';

  const [benefIsEligible, setBenefIsEligible] = useState<boolean>(false);
  const [dob, setDob] = useState<string | undefined>(undefined);
  const fieldsetId = 'allowanceStep-fieldset';

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

  const buttonClickedHandler = () => {
    setRadioButtonsState(allowance === null ? 'error' : 'default');
    setDobState(!dob ? 'error' : 'default');

    if (dob && allowance) {
      setIsValidated(true);
    } else {
      setIsValidated(false);
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
              <span className="text--italic">Tous les champs ci-dessous sont obligatoires *</span>
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
            <div>
              <Input
                label={
                  <>
                    Date de naissance du bénéficiaire <span className="text--required">*</span>
                  </>
                }
                nativeInputProps={{
                  type: 'date',
                  min: '1990-01-01',
                  max: '2099-12-31',
                  required: true,
                  value: dob,
                  autoFocus: true,
                  onChange: (e) => {
                    setDob(e.target.value ?? undefined);
                  },
                }}
                hintText="Personne à qui le pass Sport est destiné."
                state={dobState}
                stateRelatedMessage={dobStateRelatedMessages}
              />
              <CustomRadioButtons
                id={fieldsetId}
                state={radioButtonsState}
                stateRelatedMessage={radioButtonsStateRelatedMessage}
                name="radio"
                legend={
                  <>
                    Le bénéficiaire est-il concerné par l’une de ces allocations ?{' '}
                    <span className="text--required">*</span>
                  </>
                }
                key={CustomButtonsGroupKey}
                onOkButtonClicked={buttonClickedHandler}
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
                        Étudiant boursier
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Bourse du CROUS ou bourse régionale pour une formation sanitaire ou
                          sociale
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
                        Aucune
                        <br />
                        <span className="display--block fr-text--xs text--mention-grey fr-mb-0">
                          Aucune de ces propositions
                        </span>
                      </p>
                    ),
                    nativeInputProps: {
                      onChange: () => {
                        setIsValidated(false);
                        setAllowance(ALLOWANCE.NONE);
                        setOriginalAllowance(ALLOWANCE.NONE);
                      },
                    },
                  },
                ]}
              />
            </div>
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

              {allowance === ALLOWANCE.AEEH &&
                dob &&
                getAeehCodeObtentionType(dob).displayType === AEEH_CODE_OBTENTION_TYPE.LINK && (
                  <>
                    <Alert
                      severity="success"
                      title="Bonne nouvelle, d'après les informations que vous avez fournies, vous êtes éligible au pass Sport"
                      aria-live="polite"
                      description="En raison des politiques de confidentialité mises en place pour la protection de vos données, merci  de nous contacter en préparant votre pièce justificative pour obtenir votre pass Sport."
                    />

                    <p className="fr-mt-2w">
                      <Link
                        href={`/v2/jeunes-et-parents?${JEUNES_PARENTS_PAGE_AEEH_PARAMS.aeehModalOpened}=1#${SKIP_LINKS_ID.aeehContent}`}
                        className="fr-link fr-link--icon-left fr-icon-mail-line"
                      >
                        Contactez-nous pour obtenir votre code
                      </Link>
                    </p>
                  </>
                )}

              {allowance === ALLOWANCE.CROUS && CODES_OBTAINABLE_FOR_CROUS && (
                <CrousEligibilityTestForms />
              )}
            </>
          )}
        </div>
      </div>

      <div ref={portalRef}>
        {isValidated &&
          benefIsEligible &&
          allowance === ALLOWANCE.CROUS &&
          !CODES_OBTAINABLE_FOR_CROUS && (
            <div
              style={{
                maxWidth: 792,
                margin: '0 auto 24px auto',
              }}
            >
              <Alert
                severity="info"
                title="Les étudiants boursiers pourront obtenir leur code progressivement à partir du 1er novembre."
                description={
                  <p>
                    Vous les recevrez directement dans votre boite courriel.
                    <br />
                    Nous nous excusons pour la gêne occasionnée.
                  </p>
                }
              />
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
