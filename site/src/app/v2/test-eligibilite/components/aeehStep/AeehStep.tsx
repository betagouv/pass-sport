import Question from '../Question/Question';

import { useState } from 'react';
import RadioButtonsGroup from '../radioButtonsGroup/RadioButtonsGroup';
import Link from 'next/link';
import { AGE_RANGE } from '../types/types';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import { useRouter } from 'next/navigation';
import rootStyles from '@/app/styles.module.scss';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
interface Props {
  ageRange: AGE_RANGE;
}

const AeehStep = ({ ageRange }: Props) => {
  const [hasAeehAllocation, setHasAeehAllocation] = useState<boolean | null>(null);
  const router = useRouter();

  const displaySuccess = hasAeehAllocation;
  const displayFailure =
    ageRange === AGE_RANGE.BETWEEN_19_30 ||
    (ageRange === AGE_RANGE.BETWEEN_6_19 && hasAeehAllocation === false);

  return (
    <>
      {ageRange !== AGE_RANGE.BETWEEN_19_30 && (
        <Question
          question={
            <>
              <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                Vos parent bénéficient-ils de l&apos;allocation d&apos;éducation de l&apos;enfant
                handicapé (AEEH) ?
              </p>
              <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                Si vous ne le savez pas, rapprochez de vos parents, ils sauront vous répondre.
              </p>
            </>
          }
        >
          <RadioButtonsGroup
            fieldsetId="aeehStep"
            options={[
              {
                label: 'Oui',
                onChange: () => setHasAeehAllocation(true),
              },
              {
                label: 'Non',
                onChange: () => setHasAeehAllocation(false),
              },
            ]}
          />
        </Question>
      )}

      {displaySuccess && (
        <VerdictPanel
          title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous
          êtes éligible au pass Sport."
          isSuccess
          buttonProps={{
            children: 'Trouver un club partenaire',
            onClick: () => {
              router.push('trouver-un-club');
            },
          }}
        >
          Vous devriez le recevoir soit entre le 30 mai et le 1er juin, soit le 29 et le 31 août
          2024 sur l&apos;adresse e-mail que vous avez communiquée à votre CAF, Mutualité sociale
          agricole ou votre CROUS.
          <br />
          <br />
          Il vous permettra de déduire 50 euros de votre adhésion sportif dans plus de 85 000 clubs
          et associations sportives partenaires dans toute la France.
          <br />
          <br />
          Si après le 1er septembre vous ne l&apos;avez pas reçu, vous aurez la possibilité
          d&apos;en faire la demande sur{' '}
          <Link href="https://pass.sports.gouv.fr" target="_blank">
            pass.sports.gouv.fr
          </Link>
        </VerdictPanel>
      )}

      {displayFailure && (
        <VerdictPanel
          title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes
        pas éligible au pass Sport"
          isSuccess={false}
        >
          <div className="fr-mb-2w">En effet, ce dispositif est ouvert aux:</div>
          <EligibilityCriteriaList />
          <span className={rootStyles['text--medium']}>
            Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
            rapprocher de votre région, département ou commune de résidence.
          </span>
        </VerdictPanel>
      )}
    </>
  );
};

export default AeehStep;
