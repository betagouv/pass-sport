'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

export function AccordionsLogos() {
  return (
    <>
      <h2 className="fr-mb-2w fr-h6">Logos</h2>
      <Accordion
        label="Charte d’utilisation des logos"
        expanded={false}
        onExpandedChange={() => {}}
      >
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/logos/charte_utilisation_des_logos_pass_sport.pdf"
              label="Télécharger la charte d'utilisation des logos"
              details="PDF ~ 5.3 MB"
            />
          </li>
        </ul>
      </Accordion>
      <Accordion label="Logos" expanded={false} onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <DownloadLink
              href="/assets/partenaires/logos/logo_bleu_principal.png"
              label="Télécharger le logo bleu (principal)"
              details="png ~ 7.6 KB"
            />
          </li>
          <li>
            <DownloadLink
              href="/assets/partenaires/logos/logo_blanc_secondaire.png"
              label="Télécharger le logo blanc (secondaire)"
              details="png ~ 34.7 KB"
            />
          </li>
        </ul>
      </Accordion>
    </>
  );
}
