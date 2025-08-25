'use client';

import Accordion from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

export default function AccordionKakemono() {
  return (
    <Accordion label="Kakémono" expanded={false} onExpandedChange={() => {}}>
      <ul className="fr-pl-4w">
        <li>
          <Link
            href="/assets/partenaires/kakemono/kakemono_pass_sport_2025.pdf"
            className="fr-link"
            download="kakemono_pass_sport_2025.pdf"
            target="_blank"
          >
            Kakémono
          </Link>
          <p className="fr-mt-1v fr-text--xs fr-mb-0">PDF ~ 84.6 KB</p>
        </li>
      </ul>
    </Accordion>
  );
}
