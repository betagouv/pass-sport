'use client';

import Question from '@/app/v2/test-eligibilite/components/Question/Question';
import RadioButtonsGroup from '@/app/v2/test-eligibilite/components/radioButtonsGroup/RadioButtonsGroup';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';
import styles from './styles.module.scss';
import { useState } from 'react';
import { ALLOWANCE } from '../types/types';
import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import StepOneForm from '../step-one-form/StepOneForm';
import EligibilityTestForms from '../eligibility-test-forms/EligibilityTestForms';
import CrousStep from '../crous-step/crousStep';

const AllowanceStep = () => {
  const [allowance, setAllowance] = useState<ALLOWANCE | null>(null);
  return (
    <>
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
      >
        <RadioButtonsGroup
          // key={CustomButtonsGroupKey}
          fieldsetId="allowanceStep"
          options={[
            {
              label: 'AEEH, ARS, AAH',
              onChange: () => setAllowance(ALLOWANCE.ARS_AEEH_AAH),
            },
            {
              label: 'CROUS',
              onChange: () => setAllowance(ALLOWANCE.CROUS),
            },
            {
              label: 'Aucune',
              onChange: () => setAllowance(ALLOWANCE.NONE),
            },
          ]}
          description={
            <>
              <div className={styles.container}>
                <span className="fr-icon--sm fr-icon-info-fill" aria-hidden="true"></span>
                <div>
                  <p className={cn('fr-text--xs', 'fr-mb-0')}>
                    ARS : Allocation de rentrée scolaire
                  </p>
                  <p className={cn('fr-text--xs', 'fr-mb-0')}>
                    AEEH : Allocation d’éducation de l’enfant handicapé
                  </p>
                  <p className={cn('fr-text--xs', 'fr-mb-0')}>AAH : Allocation adulte handicapé</p>
                  <p className={cn('fr-text--xs', 'fr-mb-0')}>
                    CROUS : (Étudiant boursier) Centre régional des œuvres universitaires et
                    scolaires
                  </p>
                </div>
              </div>
            </>
          }
        />
      </Question>
      {allowance === ALLOWANCE.NONE && (
        <VerdictPanel
          title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes pas éligible au pass Sport"
          isSuccess={false}
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
    </>
  );
};

export default AllowanceStep;
