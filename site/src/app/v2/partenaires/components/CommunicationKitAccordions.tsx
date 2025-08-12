'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export default function CommunicationKitAccordions() {
  return (
    <>
      <h2 className="fr-mb-2w">Outils à imprimer</h2>

      <p className="fr-mb-2w text--italic">
        Supports à imprimer pour valoriser le pass Sport dans un lieu public, lors
        d&apos;événements, etc.
      </p>

      <Accordion
        label="Affiches A3 pour les structures sportives acceptant le pass Sport"
        expanded={false}
        onExpandedChange={() => {}}
      >
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

      <Accordion
        label="Affiches A3 pour les partenaires"
        expanded={false}
        onExpandedChange={() => {}}
      >
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

      <Accordion label="Flyer à distribuer" expanded={false} onExpandedChange={() => {}}>
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
      <Accordion label="Kakémono" expanded={false} onExpandedChange={() => {}}>
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
