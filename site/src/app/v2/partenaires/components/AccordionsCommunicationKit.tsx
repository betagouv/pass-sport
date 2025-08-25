'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import AccordionKakemono from '@/app/v2/partenaires/components/AccordionKakemono';

export default function AccordionsCommunicationKit() {
  return (
    <>
      <h2 className="fr-mb-2w fr-h6">À afficher ou distribuer</h2>
      <Accordion label="Affiches à destination des jeunes - A3" onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_jeunes.pdf"
              className="fr-link"
              download="partenaires_affiche_destination_des_jeunes.pdf"
              target="_blank"
            >
              Affiches à destination des jeunes - A3
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 80.5 KB</p>
          </li>
        </ul>
      </Accordion>

      <Accordion label="Affiches à destination des parents - A3" onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_parents.pdf"
              className="fr-link"
              download="partenaires_affiche_destination_des_parents.pdf"
              target="_blank"
            >
              Affiches à destination des parents - A3
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 223 KB</p>
          </li>
        </ul>
      </Accordion>
      <Accordion
        label="Flyer pass Sport à distribuer - A4"
        expanded={false}
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/flyers/flyer_pass_sport_2025.pdf"
              className="fr-link"
              download="flyer_pass_sport_2025.pdf"
              target="_blank"
            >
              Flyer pass Sport à distribuer - A4
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 106 KB</p>
          </li>
        </ul>
      </Accordion>
      <AccordionKakemono />
    </>
  );
}
