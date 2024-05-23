import Question, {
  QUESTION_STYLES,
} from '@/app/v2/test-eligibilite-mai/components/Question/Question';
import { useState } from 'react';
import { CROUS_AGE_RANGE } from '../types/types';
import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import rootStyles from '@/app/styles.module.scss';
import cn from 'classnames';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import RadioButtons from '@codegouvfr/react-dsfr/RadioButtons';
import FullNegativeVerdictPanel from '@/app/components/verdictPanel/FullNegativeVerdictPanel';
import { useRouter } from 'next/navigation';

const CrousStep = () => {
  const [ageRange, setAgeRange] = useState<CROUS_AGE_RANGE | null>(null);
  const router = useRouter();

  return (
    <div>
      <Question question="Quel âge avez-vous ?" style={QUESTION_STYLES.JUNE_STYLE}>
        <RadioButtons
          legend="Choississez une option:"
          options={[
            {
              label: 'Moins de 28 ans',
              nativeInputProps: {
                onChange: () => setAgeRange(CROUS_AGE_RANGE.LESS_THAN_28),
              },
            },
            {
              label: '28 ans révolus (au plus tard le 15 octobre 2024)',
              nativeInputProps: {
                onChange: () => setAgeRange(CROUS_AGE_RANGE.MORE_THAN_28),
              },
            },
            {
              label: 'Plus de 29 ans',
              nativeInputProps: {
                onChange: () => setAgeRange(CROUS_AGE_RANGE.MORE_THAN_29),
              },
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
          <p
            className={cn(
              'fr-text--lg',
              'fr-mb-3w',
              rootStyles['text--black'],
              rootStyles['text--medium'],
            )}
          >
            Vous le recevrez à l&apos;adresse mail que vous avez communiqué à votre CROUS fin août,
            une fois que votre dossier de demande a été accepté.
          </p>
          <p
            className={cn(
              'fr-text--lg',
              'fr-mb-3w',
              rootStyles['text--black'],
              rootStyles['text--medium'],
            )}
          >
            Il vous permettra de déduire 50 euros de votre inscription dans l’une des 85 000
            structures sportives et associations sportives partenaires dans toute la France.
          </p>
          <p
            className={cn(
              'fr-text--lg',
              'fr-mb-1w',
              rootStyles['text--black'],
              rootStyles['text--medium'],
            )}
          >
            Si après le 1er septembre vous n&apos;avez pas reçu votre pass, vous aurez la
            possibilité d&apos;en faire la demande sur{' '}
            <Link href="https://pass.sports.gouv.fr" target="_blank">
              pass.sports.gouv.fr
            </Link>
            .
          </p>
          <Button priority="primary" onClick={() => router.push('/v2/trouver-un-club')}>
            {' '}
            Trouver une structure partenaire
          </Button>
        </VerdictPanel>
      )}

      {(ageRange === CROUS_AGE_RANGE.MORE_THAN_29 || ageRange === CROUS_AGE_RANGE.MORE_THAN_28) && (
        <FullNegativeVerdictPanel isLean />
      )}
    </div>
  );
};

export default CrousStep;
