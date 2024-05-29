'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import { push } from '@socialgouv/matomo-next';
import { useRouter } from 'next/navigation';
import { isUsingJuneEligibilityTest } from 'utils/eligibility-test';

export default function ObtainPassPort() {
  const router = useRouter();

  const eligibilityTestOnClick = () => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'Know everything test button']);
    isUsingJuneEligibilityTest
      ? router.push('/v2/test-eligibilite', { scroll: true })
      : router.push('/v2/test-eligibilite-mai', { scroll: true });
  };

  return (
    <section id="pour-qui">
      <h4>Qui peut obtenir le pass Sport ?</h4>

      <span>Le pass Sport 2024 s&apos;adressera aux jeunes qui sont :</span>
      <ul>
        <li>
          nés entre le 16 septembre 2006 et le 31 décembre 2018 et bénéficient de l&apos;allocation
          de rentrée scolaire ;
        </li>
        <li>
          nés entre le 1er juin 2004 et le 31 décembre 2018 et bénéficient de l&apos;allocation
          d&apos;éducation de l&apos;enfant handicapé ;
        </li>
        <li>
          nés entre le 16 septembre 1993 et le 31 décembre 2008 et bénéficient de l&apos;allocation
          aux adultes handicapés ;
        </li>
        <li>
          étudiants, âgés de 28 ans révolus au plus, et bénéficient au plus tard le 15 octobre 2024,
          d&apos;une bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de
          ressources, d&apos;une aide annuelle du CROUS ou d&apos;une bourse régionale pour les
          formations sanitaires et sociales pour l&apos;année universitaire 2024 - 2025.
        </li>
      </ul>

      <Button
        iconId="fr-icon-arrow-right-line"
        iconPosition="right"
        onClick={eligibilityTestOnClick}
      >
        Je fais le test
      </Button>
    </section>
  );
}
