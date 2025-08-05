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
        <ul>
          <li>
            <Link
              href="/assets/ressources/affiches/a3_clubs.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiches A3 pour les structures sportives acceptant le pass Sport
            </Link>
          </li>
        </ul>
      </Accordion>

      <Accordion
        label="Affiches A3 pour les partenaires"
        expanded={false}
        onExpandedChange={() => {}}
      >
        <ul>
          <li>
            <Link
              href="/assets/ressources/affiches/a3_hors_salles_et_clubs.pdf"
              className="fr-link"
              target="_blank"
            >
              Affiches A3 pour les partenaires
            </Link>
          </li>
        </ul>
      </Accordion>
      <Accordion label="Flyer à distribuer" expanded={false} onExpandedChange={() => {}}>
        <ul>
          <li>
            <Link href="/assets/ressources/flyers/flyer.pdf" className="fr-link" target="_blank">
              Flyer à distribuer
            </Link>
          </li>
        </ul>
      </Accordion>
      <Accordion label="Kakémono" expanded={false} onExpandedChange={() => {}}>
        <ul>
          <li>
            <Link
              href="/assets/ressources/kakemono/kakemono.pdf"
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
