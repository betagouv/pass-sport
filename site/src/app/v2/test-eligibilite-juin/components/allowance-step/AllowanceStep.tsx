'use client';

import Question, { QUESTION_STYLES } from '@/app/v2/test-eligibilite/components/Question/Question';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';
import { useState } from 'react';
import { ALLOWANCE } from '../types/types';
import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import EligibilityTestForms from '../eligibility-test-forms/EligibilityTestForms';
import CrousStep from '../crous-step/CrousStep';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import RadioButtons from '@codegouvfr/react-dsfr/RadioButtons';

/* This is a trick to force the RadioButtonsGroup to reload */
let CustomButtonsGroupKey = 0;

const AllowanceStep = () => {
  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);

  const restartTest = () => {
    CustomButtonsGroupKey = Math.round(Math.random() * 1000);
    setAllowance(null);
  };

  return (
    <EligibilityTestContext.Provider value={{ performNewTest: restartTest }}>
      <Question
        question={
          <>
            <p
              className={cn(
                'fr-text--lg',
                'fr-mb-0',
                rootStyles['text--medium'],
                rootStyles['text--black'],
              )}
            >
              Bonjour, vous souhaitez vérifier si vous pouvez bénéficier du pass Sport. Vous faites
              le test.
            </p>
            <p
              className={cn(
                'fr-text--lg',
                'fr-mb-0',
                rootStyles['text--medium'],
                rootStyles['text--black'],
              )}
            >
              Bénéficiez-vous d’une de ces allocations :
            </p>
          </>
        }
        style={QUESTION_STYLES.JUNE_STYLE}
      >
        <RadioButtons
          key={CustomButtonsGroupKey}
          legend="Choisissez une option:"
          name="radio"
          options={[
            {
              label: 'AEEH, ARS, AAH',
              nativeInputProps: {
                onChange: () => setAllowance(ALLOWANCE.ARS_AEEH_AAH),
              },
            },
            {
              label: 'CROUS',
              nativeInputProps: {
                onChange: () => setAllowance(ALLOWANCE.CROUS),
              },
            },
            {
              label: 'Aucune',
              nativeInputProps: {
                onChange: () => setAllowance(ALLOWANCE.NONE),
              },
            },
          ]}
          hintText={
            <>
              <div>
                <p className={cn('fr-text--xs', 'fr-mb-0')}>ARS : Allocation de rentrée scolaire</p>
                <p className={cn('fr-text--xs', 'fr-mb-0')}>
                  AEEH : Allocation d’éducation de l’enfant handicapé
                </p>
                <p className={cn('fr-text--xs', 'fr-mb-0')}>AAH : Allocation adulte handicapé</p>
                <p className={cn('fr-text--xs', 'fr-mb-0')}>
                  CROUS : Étudiant boursier. Centre régional des œuvres universitaires et scolaires
                </p>
              </div>
            </>
          }
        />
      </Question>

      {allowance === ALLOWANCE.NONE && (
        <VerdictPanel
          title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes pas éligible au pass Sport"
          isSuccess={false}
          isLean
        >
          <p className={cn('fr-mb-2w', 'fr-text--lg', rootStyles['text--black'])}>
            En effet, ce dispositif est ouvert aux:
          </p>
          <EligibilityCriteriaList />
          <p className={cn('fr-text--bold', rootStyles['text--black'])}>
            Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
            rapprocher de votre région, département ou commune de résidence.
          </p>
        </VerdictPanel>
      )}

      {allowance === ALLOWANCE.ARS_AEEH_AAH && <EligibilityTestForms />}
      {allowance === ALLOWANCE.CROUS && <CrousStep />}
    </EligibilityTestContext.Provider>
  );
};

export default AllowanceStep;
