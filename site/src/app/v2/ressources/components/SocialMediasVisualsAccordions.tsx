'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export default function SocialMediasVisualsAccordions() {
  return (
    <>
      <h2 className="fr-mb-2w">Outils digitaux</h2>

      <p className="fr-mb-2w text--italic">
        Logos et visuels pour communiquer sur les réseaux sociaux auprès de vos différents publics
      </p>

      <Accordion label="Logos" expanded={false} onExpandedChange={() => {}}>
        <ul>
          <li>
            <Link
              href="/assets/ressources/logos/Charte%20d'utilisation%20des%20logos%20pass%20Sport.pdf"
              className="fr-link"
              target="_blank"
            >
              Charte d’utilisation
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/logos/Logo%20bleu%20(principal).png"
              className="fr-link"
              target="_blank"
            >
              Logo bleu (principal)
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/logos/Logo%20blanc%20(secondaire).png"
              className="fr-link"
              target="_blank"
            >
              Logo blanc (secondaire)
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Visuels" expanded={false} onExpandedChange={() => {}}>
        <ul>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/%5BStructures%20sportives%5D%20Visuel%20pour%20communiquer%20aupres%20des%20jeunes.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication des structures sportives en direction des jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/%5BStructures%20sportives%5D%20Visuel%20pour%20communiquer%20aupres%20des%20parents.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication des structures sportives en direction des parents
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/Visuel%20pour%20communiquer%20aupres%20des%20jeunes.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/Visuel%20pour%20communiquer%20aupres%20des%20parents.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication générique pour les parents
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/Visuel%20pour%20communiquer%20aupres%20des%20etudiants%20boursiers.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les étudiants boursiers
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/Visuel%20pour%20les%20beneficiaires%20AAH.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les bénéficiaires de l’AAH
            </Link>
          </li>
          <li>
            <Link
              href="/assets/ressources/reseaux-sociaux/Visuel%20pour%20les%20parents%20de%20beneficiaires%20AEEH.jpg"
              className="fr-link"
              target="_blank"
            >
              Communication pour les parents des bénéficiaires de l’AEEH
            </Link>
          </li>
        </ul>
      </Accordion>
    </>
  );
}
