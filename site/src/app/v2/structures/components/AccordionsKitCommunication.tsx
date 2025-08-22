import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export function AccordionsKitCommunication() {
  return (
    <>
      <Accordion label="Affiches A3 pour les structures sportives acceptant le pass Sport">
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_jeunes.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiches pour communiquer auprès des jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_parents.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiches pour communiquer auprès des parents
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Affiches A3 pour les partenaires">
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_jeunes.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiche pour communiquer auprès des jeunes
            </Link>
          </li>
          <li>
            <Link
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_parents.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiche pour communiquer auprès des parents
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Flyer à distribuer">
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/flyers/flyer_pass_sport_2025.pdf"
              className="fr-link"
              target="_blank"
            >
              Flyer à distribuer
            </Link>
          </li>
        </ul>
      </Accordion>
      <Accordion label="Kakémono">
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/kakemono/kakemono_pass_sport_2025.pdf"
              className="fr-link"
              target="_blank"
            >
              Kakémono
            </Link>
          </li>
        </ul>
      </Accordion>
    </>
  );
}
