import Question from '../Question/Question';
import { useState } from 'react';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import RadioButtonsGroup from '../radioButtonsGroup/RadioButtonsGroup';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import rootStyles from '@/app/utilities.module.scss';
import EligibilityCriteriaList from '@/app/components/eligibility-criteria-list/EligibilityCriteriaList';
import cn from 'classnames';

interface Props {
  isForChild: boolean;
}

const AllowancesStep = ({ isForChild }: Props) => {
  const [hasAllowances, setHasAllowances] = useState<boolean | null>(null);
  const router = useRouter();

  const successCallout = (
    <div>
      <VerdictPanel
        title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous êtes éligible au pass Sport."
        isSuccess
        buttonProps={{
          children: 'Trouver un club partenaire',
          onClick: () => {
            router.push('trouver-un-club');
          },
        }}
      >
        <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
          Vous devriez le recevoir soit entre le 30 mai et le 1er juin, soit le 29 et le 31 août
          2024 sur l&apos;adresse e-mail que vous avez communiquée à votre CAF, Mutualité sociale
          agricole ou votre CROUS.
        </p>
        <br />
        <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
          Il vous permettra de déduire 50 euros de votre adhésion sportif dans plus de 85 000 clubs
          et associations sportives partenaires dans toute la France.
        </p>
        <br />
        <p className={cn('fr-text--lg', rootStyles['text--medium'], rootStyles['text--black'])}>
          Si après le 1er septembre vous ne l&apos;avez pas reçu, vous aurez la possibilité
          d&apos;en faire la demande sur{' '}
          <Link href="https://pass.sports.gouv.fr" target="_blank">
            pass.sports.gouv.fr
          </Link>
        </p>
      </VerdictPanel>
    </div>
  );

  const failureCallOut = (
    <VerdictPanel
      title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes pas éligible au pass Sport"
      isSuccess={false}
    >
      <p className={cn('fr-text--lg', rootStyles['text--black'], rootStyles['text--medium'])}>
        En effet, ce dispositif n&apos;est pas accessible à tous, il est ouvert aux:
      </p>
      <EligibilityCriteriaList />
    </VerdictPanel>
  );

  return (
    <>
      <Question
        question={
          <>
            {isForChild ? (
              <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                Votre enfant (ou petit enfant) bénéficie-t-il :
              </p>
            ) : (
              <>
                <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                  Vous avez entre 16 et 30 ans.
                </p>
                <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                  Bénéficiez-vous :
                </p>
              </>
            )}
            <ul className="fr-ml-2w fr-mt-4w">
              <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                d&apos;une bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de
                ressources, d&apos;une aide annuelle du CROUS ou d&apos;une bourse régionale pour
                les formations sanitaires et sociales pour l&apos;année universitaire 2023-2024 ou
                2024-2025?
              </li>
            </ul>
            ou
            <ul className="fr-ml-2w">
              <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                de l&apos;allocation aux adultes handicapées (AAH)?
              </li>
            </ul>
            ou
            <ul className="fr-ml-2w">
              <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                de l&apos;allocation de rentrée scolaire (ARS)?
              </li>
            </ul>
            ou
            <ul className="fr-ml-2w">
              <li className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
                ou de l&apos;allocation d&apos;éducation de l&apos;enfant handicapé (AEEH)?
              </li>
            </ul>
          </>
        }
      >
        <RadioButtonsGroup
          fieldsetId="allowanceStep"
          options={[
            {
              label: 'Oui',
              onChange: () => setHasAllowances(true),
            },
            {
              label: 'Non',
              onChange: () => setHasAllowances(false),
            },
          ]}
        />
      </Question>

      {hasAllowances && successCallout}
      {hasAllowances === false && failureCallOut}
    </>
  );
};

export default AllowancesStep;
