import Question from '../Question/Question';
import { useState } from 'react';
import RadioButtonsGroup from '../radioButtonsGroup/RadioButtonsGroup';
import { AGE_RANGE } from '../types/types';
import Link from 'next/link';
import AeehStep from '../aeehStep/AeehStep';
import VerdictPanel from '../../../../components/verdictPanel/VerdictPanel';
import { useRouter } from 'next/navigation';
import rootStyles from '@/app/styles.module.scss';

interface AgeStep2Props {
  ageRange: AGE_RANGE;
}

const AgeStep2 = ({ ageRange }: AgeStep2Props) => {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const router = useRouter();

  if (ageRange === AGE_RANGE.GREATER_THAN_30) return null;

  const question =
    ageRange === AGE_RANGE.BETWEEN_6_19 ? (
      <p className={rootStyles['text--medium']}>
        Vos parents touchent-ils l&apos;allocation de rentrée scolaire ? Si vous ne le savez pas,
        rapprochez de vos parents, ils sauront vous répondre.
      </p>
    ) : (
      <div>
        <p className={`fr-text--lg fr-mb-0 ${rootStyles['text--medium']}`}>
          Vous avez entre 19 et 30 ans.
          <br />
          Bénéficiez-vous :
        </p>
        <ul className={`fr-text--lg fr-ml-2w ${rootStyles['text--medium']}`}>
          <li>
            d&apos;une bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de
            ressources, d&apos;une aide annuelle du CROUS ou d&apos;une bourse régionale pour les
            formations sanitaires et sociales pour l&apos;année universitaire 2024-2025&nbsp;?
          </li>
          <li>de l&apos;allocation aux adultes handicapées (AAH) ? </li>
          <li>ou de l&apos;allocation d&apos;éducation de l&apos;enfant handicapé (AEEH)&nbsp;?</li>
        </ul>
      </div>
    );

  const questionDescription =
    ageRange === AGE_RANGE.BETWEEN_6_19
      ? `L'allocation de rentrée scolaire est une aide versée par votre caisse d'allocation
    familiale (CAF) ou votre Mutualité sociale agricole (MSA) pour vous aider à couvrir les
    frais de rentrée scolaire. Elle est générale, versée dans le mois d'août. Si vous ne le
    savez pas, rapprochez-vous de votre CAF ou de votre Mutualité sociale agricole.`
      : '';

  return (
    <div>
      <Question question={question} description={questionDescription}>
        <RadioButtonsGroup
          fieldsetId="ageStep2"
          options={[
            {
              label: 'Oui',
              onChange: () => setConfirmed(true),
            },
            {
              label: 'Non',
              onChange: () => setConfirmed(false),
            },
          ]}
        />
      </Question>

      {confirmed && (
        <VerdictPanel
          title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous
          êtes éligible au pass Sport."
          buttonProps={{
            children: 'Trouver un club partenaire',
            onClick: () => {
              router.push('trouver-un-club');
            },
          }}
          isSuccess
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

      {confirmed === false && <AeehStep ageRange={ageRange} />}
    </div>
  );
};

export default AgeStep2;
