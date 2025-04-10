'use client';
import { push } from '@socialgouv/matomo-next';
import { useRouter } from 'next/navigation';

import Button from '@codegouvfr/react-dsfr/Button';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { CROUS } from '../../accueil/components/acronymes/Acronymes';
import { isPasSportClosed } from '@/utils/date';

export default function ObtainPassPort() {
  const router = useRouter();

  const eligibilityTestOnClick = () => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'Know everything test button']);
    router.push('/v2/test-eligibilite', { scroll: true });
  };

  return (
    <section id="pour-qui">
      <h2 className="fr-h4">Qui peut obtenir le pass Sport ?</h2>

      <span>Le pass Sport 2025 s&apos;adressera aux jeunes qui sont :</span>
      <ul>
        <li>
          nés entre le 16 septembre 2007 et le 31 décembre 2019 et bénéficient de l&apos;allocation
          de rentrée scolaire ;
        </li>
        <li>
          nés entre le 1er juin 2005 et le 31 décembre 2019 et bénéficient de l&apos;allocation
          d&apos;éducation de l&apos;enfant handicapé ;
        </li>
        <li>
          nés entre le 16 septembre 1994 et le 31 décembre 2009 et bénéficient de l&apos;allocation
          aux adultes handicapés ;
        </li>
        <li>
          étudiants, âgés de 28 ans révolus au plus, et bénéficient au plus tard le 15 octobre 2025,
          d&apos;une bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de
          ressources, d&apos;une aide annuelle du <CROUS /> ou d&apos;une bourse régionale pour les
          formations sanitaires et sociales pour l&apos;année universitaire 2025 - 2026.
        </li>
      </ul>

      {!isPasSportClosed() && (
        <Button
          iconId="fr-icon-arrow-right-line"
          iconPosition="right"
          linkProps={{
            href: '/v2/test-eligibilite-base',
            'aria-label': "Visiter la page pour effectuer le test d'éligibilité",
            onClick: eligibilityTestOnClick,
          }}
        >
          Je fais le test
        </Button>
      )}
    </section>
  );
}
