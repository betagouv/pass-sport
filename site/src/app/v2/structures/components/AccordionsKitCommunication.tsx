'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';
import WebsiteAccordions from '@/app/v2/partenaires/components/AccordionsWebsites';
import { AccordionsLogos } from '@/app/v2/structures/components/AccordionsLogos';
import AccordionKakemono from '@/app/v2/partenaires/components/AccordionKakemono';
import AccordionsSocialMediasVisuals from '@/app/v2/structures/components/AccordionsSocialMediasVisuals';

export function AccordionsKitCommunication() {
  return (
    <>
      <Accordion label="À afficher ou distribuer">
        <p>Affiches :</p>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_jeunes.pdf"
              className="fr-link"
              target="_blank"
              download="structures_sportives_affiche_destination_des_jeunes.pdf"
            >
              Affiche à destination des jeunes - A3
            </Link>
            <p className="fr-mt-1v fr-text--xs">PDF ~ 80.5 KB</p>
          </li>
          <li>
            <Link
              href="/assets/partenaires/affiches/structures_sportives_affiche_destination_des_parents.pdf"
              className="fr-link"
              target="_blank"
              download="structures_sportives_affiche_destination_des_parents.pdf"
            >
              Affiche à destination des parents - A3
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 79.0 KB</p>
          </li>
        </ul>

        <p>Flyer :</p>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/flyers/flyer_pass_sport_2025.pdf"
              className="fr-link"
              target="_blank"
              download="flyer_pass_sport_2025.pdf"
            >
              Flyer
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 106 KB</p>
          </li>
        </ul>
      </Accordion>

      <AccordionsSocialMediasVisuals />
      <WebsiteAccordions displayTitle={false} />
      <AccordionsLogos />
      <AccordionKakemono />
    </>
  );
}
