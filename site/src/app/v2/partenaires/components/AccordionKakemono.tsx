'use client';

import Accordion, { AccordionProps } from '@codegouvfr/react-dsfr/Accordion';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

type AccordionKakemonoProps = {
  titleAs: AccordionProps['titleAs'];
};

export default function AccordionKakemono({ titleAs }: AccordionKakemonoProps) {
  return (
    <Accordion label="Kakémono" expanded={false} onExpandedChange={() => {}} titleAs={titleAs}>
      <ul className="fr-pl-4w">
        <li>
          <DownloadLink
            details="PDF ~ 84.6 KB"
            label="Kakémono"
            href="/assets/partenaires/kakemono/kakemono_pass_sport_2025.pdf"
          />
        </li>
      </ul>
    </Accordion>
  );
}
