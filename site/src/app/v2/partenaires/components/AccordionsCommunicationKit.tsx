'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import AccordionKakemono from '@/app/v2/partenaires/components/AccordionKakemono';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export default function AccordionsCommunicationKit() {
  return (
    <>
      <h2 className="fr-mb-2w fr-h6">À afficher ou distribuer</h2>
      <Accordion label="Affiches à destination des jeunes - A3" onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_jeunes.pdf"
              label="Affiches à destination des jeunes - A3"
              details="PDF ~ 220 KB"
            />
          </li>
        </ul>
      </Accordion>

      <Accordion label="Affiches à destination des parents - A3" onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/partenaires_affiche_destination_des_parents.pdf"
              label="Affiches à destination des parents - A3"
              details="PDF ~ 223 KB"
            />
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
            <DownloadLink
              href="/assets/partenaires/flyers/flyer_pass_sport_2025.pdf"
              label="Flyer pass Sport à distribuer - A4"
              details="PDF ~ 106 KB"
            />
          </li>
        </ul>
      </Accordion>
      <AccordionKakemono titleAs="h3" />
    </>
  );
}
