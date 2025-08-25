'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export function AccordionsLogos() {
  return (
    <>
      <h2 className="fr-mb-2w fr-h6">Logos</h2>
      <Accordion label="Charte d’utilisation" expanded={false} onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/logos/charte_utilisation_des_logos_pass_sport.pdf"
              className="fr-link"
              target="_blank"
              download="charte_utilisation_des_logos_pass_sport.pdf"
            >
              Charte d&apos;utilisation
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 5.3 MB</p>
          </li>
        </ul>
      </Accordion>
      <Accordion label="Logos" expanded={false} onExpandedChange={() => {}}>
        <ul className="fr-pl-4w">
          <li>
            <Link
              href="/assets/partenaires/logos/logo_bleu_principal.png"
              className="fr-link"
              target="_blank"
              download="logo_bleu_principal.png"
            >
              Logo bleu (principal)
            </Link>
            <p className="fr-mt-1v fr-text--xs">png ~ 7.6 KB</p>
          </li>
          <li>
            <Link
              href="/assets/partenaires/logos/logo_blanc_secondaire.png"
              className="fr-link"
              target="_blank"
              download="logo_blanc_secondaire.png"
            >
              Logo blanc (secondaire)
            </Link>
            <p className="fr-mt-1v fr-text--xs fr-mb-0">png ~ 34.7 KB</p>
          </li>
        </ul>
      </Accordion>
    </>
  );
}
