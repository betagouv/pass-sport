'use client';

import styles from '@/app/v2/test-eligibilite/styles.module.scss';
import cn from 'classnames';
import { useEffect, useState } from 'react';
import { ALLOWANCE } from '../types/types';
import EligibilityTestForms from '../eligibility-test-forms/EligibilityTestForms';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import { SUPPORT_COOKIE_KEY } from '@/app/constants/cookie-manager';
import CustomRadioButtons from '@/app/v2/test-eligibilite-base/components/customRadioButtons/CustomRadioButtons';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { AAH, AEEH, ARS, CROUS } from '@/app/v2/accueil/components/acronymes/Acronymes';
import CrousEligibilityTestForms from '@/app/v2/test-eligibilite/components/crous-eligibility-test-forms/CrousEligibilityTestForms';

/* This is a trick to force the RadioButtonsGroup to reload */
let CustomButtonsGroupKey = 0;

const AllowanceStep = () => {
  const fieldsetId = 'allowanceStep-fieldset';
  useRemoveAttributeById(fieldsetId, 'aria-labelledby');

  // Ask for consent for the cookie related to support once on the page
  useEffect(() => {
    // Timeout is necessary to wait for tarteaucitron modal to be rendered properly
    setTimeout(() => {
      const tac = window.tarteaucitron;

      // "false" or "true" means the user has given or not given consent
      // otherwise it means the user didn't explicitly set any consentment
      const hasYetToGiveConsent = typeof tac?.state?.[SUPPORT_COOKIE_KEY] !== 'boolean';

      if (tac && hasYetToGiveConsent) {
        tac?.userInterface?.openAlert();

        const btn = document.querySelector<HTMLButtonElement>('#tarteaucitronPersonalize2');

        if (btn) {
          // Focus on the first button whenever the alert UI is displayed
          btn.focus();
        }
      }
    }, 2000);
  }, []);

  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);
  const [isValidated, setIsValidated] = useState(true);

  const restartTest = () => {
    CustomButtonsGroupKey = Math.round(Math.random() * 1000);
    setAllowance(null);
  };

  const buttonClickedHandler = () => {
    setIsValidated(true);
  };

  return (
    <EligibilityTestContext.Provider value={{ performNewTest: restartTest }}>
      <p className={cn('fr-pb-2w', styles.paragraph)}>Les champs ci-dessous sont obligatoires*</p>

      <CustomRadioButtons
        id={fieldsetId}
        name="radio"
        key={CustomButtonsGroupKey}
        legendLine1="Bonjour,"
        legendLine2="Bénéficiez-vous d’une de ces allocations ?"
        isOkButtonDisabled={isValidated}
        onOkButtonClicked={buttonClickedHandler}
        options={[
          {
            label: (
              <span>
                <AEEH />, <ARS />, <AAH />
              </span>
            ),
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setAllowance(ALLOWANCE.ARS_AEEH_AAH);
              },
            },
          },
          {
            label: <CROUS />,
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setAllowance(ALLOWANCE.CROUS);
              },
            },
          },
          {
            label: 'Aucune',
            nativeInputProps: {
              onChange: () => {
                setIsValidated(false);
                setAllowance(ALLOWANCE.NONE);
              },
            },
          },
        ]}
        hintText={
          <>
            <div>
              <p className={cn('fr-text--xs', 'fr-mb-0')}>
                <abbr>ARS</abbr> : Allocation de rentrée scolaire
              </p>
              <p className={cn('fr-text--xs', 'fr-mb-0')}>
                <abbr>AEEH</abbr> : Allocation d’éducation de l’enfant handicapé
              </p>
              <p className={cn('fr-text--xs', 'fr-mb-0')}>
                <abbr>AAH</abbr> : Allocation adulte handicapé
              </p>
              <p className={cn('fr-text--xs', 'fr-mb-0')}>
                <abbr>CROUS</abbr> : Étudiant boursier. Centre régional des œuvres universitaires et
                scolaires
              </p>
            </div>
          </>
        }
      />

      {isValidated && (
        <>
          {[ALLOWANCE.ARS_AEEH_AAH, ALLOWANCE.CROUS].includes(allowance as ALLOWANCE) && (
            <legend
              className="fr-fieldset__legend--regular fr-fieldset__legend fr-pt-1w fr-pb-2w"
              id="second-step-form-legend"
            >
              Deuxième étape du formulaire
            </legend>
          )}

          {allowance === ALLOWANCE.NONE && <FullNegativeVerdictPanel isLean />}
          {allowance === ALLOWANCE.ARS_AEEH_AAH && <EligibilityTestForms />}
          {allowance === ALLOWANCE.CROUS && <CrousEligibilityTestForms />}
        </>
      )}
    </EligibilityTestContext.Provider>
  );
};

export default AllowanceStep;
