'use client';

import Accordion, { AccordionProps } from '@codegouvfr/react-dsfr/Accordion';
import Link from 'next/link';

type WebsiteAccordionsProps = {
  displayTitle?: boolean;
  titleAs: AccordionProps['titleAs'];
};

export default function WebsiteAccordions({
  displayTitle = true,
  titleAs,
}: WebsiteAccordionsProps) {
  return (
    <>
      {displayTitle && <h2 className="fr-mb-2w fr-h6">Sites internet</h2>}

      <Accordion label="Pour les sites internet" onExpandedChange={() => {}} titleAs={titleAs}>
        <ul className="fr-pl-4w">
          <li className="fr-mb-1w">
            <Link href="https://youtu.be/iXjgePcJFQI" className="fr-link" target="_blank">
              Consulter la vidéo de présentation (avec athlètes)
            </Link>
          </li>
          <li>
            <Link href="https://youtu.be/E09fvxlWTsY" className="fr-link" target="_blank">
              Consulter la vidéo animée (standard)
            </Link>
          </li>
        </ul>
      </Accordion>
    </>
  );
}
