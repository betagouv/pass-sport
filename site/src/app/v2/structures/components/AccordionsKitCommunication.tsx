'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import WebsiteAccordions from '@/app/v2/partenaires/components/AccordionsWebsites';
import { AccordionsLogos } from '@/app/v2/structures/components/AccordionsLogos';
import AccordionKakemono from '@/app/v2/partenaires/components/AccordionKakemono';
import AccordionsSocialMediasVisuals from '@/app/v2/structures/components/AccordionsSocialMediasVisuals';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsKitCommunication() {
  return (
    <>
      <Accordion label="À afficher ou distribuer" titleAs="h3">
        <p>Affiches :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_jeunes.pdf"
              label="Affiche à destination des jeunes - A3"
              details="PDF ~ 80.5 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_parents.pdf"
              label="Affiche à destination des parents - A3"
              details="PDF ~ 79.0 KB"
            />
          </li>
        </ul>

        <p>Flyer :</p>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/flyers/flyer_pass_sport_2025.pdf"
              label="Flyer"
              details="PDF ~ 106 KB"
            />
          </li>
        </ul>
      </Accordion>

      <AccordionsSocialMediasVisuals />
      <WebsiteAccordions displayTitle={false} titleAs="h3" />
      <AccordionsLogos />
      <AccordionKakemono titleAs="h3" />
    </>
  );
}
