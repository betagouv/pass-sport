import Question from '@/app/v2/test-eligibilite/components/Question/Question';
import RadioButtonsGroup from '@/app/v2/test-eligibilite/components/radioButtonsGroup/RadioButtonsGroup';
import { useState } from 'react';
import { CROUS_AGE_RANGE } from '../types/types';
import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';

const CrousStep = () => {
  const [ageRange, setAgeRange] = useState<CROUS_AGE_RANGE | null>(null);

  return (
    <div>
      <Question question="Quel âge avez-vous ?">
        <RadioButtonsGroup
          fieldsetId="ageStep"
          options={[
            {
              label: 'Moins de 28 ans',
              onChange: () => setAgeRange(CROUS_AGE_RANGE.LESS_THAN_28),
            },
            {
              label: '28 ans révolus (au plus tard le 15 octobre 2024)',
              onChange: () => setAgeRange(CROUS_AGE_RANGE.MORE_THAN_28),
            },
            {
              label: 'Plus de 29 ans',
              onChange: () => setAgeRange(CROUS_AGE_RANGE.MORE_THAN_29),
            },
          ]}
        />
      </Question>

      {ageRange === CROUS_AGE_RANGE.LESS_THAN_28 && (
        <VerdictPanel
          title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous êtes éligible au pass Sport."
          isSuccess
          isLean
        >
          <p className={cn('fr-text--lg', 'fr-mb-4w', rootStyles['text--black'])}>
            Vous le recevrez à l&apos;adresse mail que vous avez communiqué à votre CROUS fin août,
            une fois que votre dossier de demande a été accepté.
          </p>
          <p className={cn('fr-text--lg', 'fr-mb-4w', rootStyles['text--black'])}>
            Il vous permettra de déduire 50 euros de votre inscription dans l’une des 85 000
            structures sportives et associations sportives partenaires dans toute la France.
          </p>
          <p className={cn('fr-text--lg', 'fr-mb-1w', rootStyles['text--black'])}>
            Si après le 1er septembre vous n&apos;avez pas reçu votre pass, vous aurez la
            possibilité d&apos;en faire la demande sur{' '}
            <Link href="https://pass.sports.gouv.fr" target="_blank">
              pass.sports.gouv.fr
            </Link>
            .
          </p>
          <Button priority="primary"> Trouver une structure partenaire</Button>
        </VerdictPanel>
      )}

      {ageRange === CROUS_AGE_RANGE.MORE_THAN_29 && (
        <VerdictPanel
          title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes
        pas éligible au pass Sport."
          isSuccess={false}
          isLean
        >
          <p className={cn('fr-mb-2w', rootStyles['text--black'])}>
            En effet, ce dispositif est ouvert aux:
          </p>
          <EligibilityCriteriaList />
          <p className={cn('fr-text--lg', 'fr-text--bold', rootStyles['text--black'])}>
            Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
            rapprocher de votre région, département ou commune de résidence.
          </p>
        </VerdictPanel>
      )}
    </div>
  );
};

export default CrousStep;
