'use client';

import SkipLinks from '@codegouvfr/react-dsfr/SkipLinks';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import React from 'react';
import { usePathname } from 'next/navigation';
import { isPasSportClosed } from '@/utils/date';

const SkipLinksWrapper = () => {
  const pathname = usePathname();

  const eligibilityTestSkipLink =
    !isPasSportClosed() &&
    pathname &&
    [
      '/v2/accueil',
      '/v2/tout-savoir-sur-le-pass-sport',
      '/v2/trouver-un-club',
      '/v2/une-question',
      '/v2/politique-de-confidentialite',
      '/v2/mentions-legales',
    ].includes(pathname)
      ? {
          label: "Test d'éligibilité",
          anchor: `#${SKIP_LINKS_ID.eligibilityTestButton}`,
        }
      : null;

  const findAClubSkipLink =
    pathname && ['/v2/tout-savoir-sur-le-pass-sport', '/v2/accueil'].includes(pathname)
      ? {
          label: 'Trouver un club',
          anchor: `#${SKIP_LINKS_ID.findClubButton}`,
        }
      : null;

  const contactUsLink =
    pathname && ['/v2/une-question', '/v2/pro/une-question'].includes(pathname)
      ? {
          label: 'Nous contacter par mail',
          anchor: `#${SKIP_LINKS_ID.contactUsByMail}`,
        }
      : null;

  return (
    <SkipLinks
      links={[
        {
          label: 'Aller au contenu',
          anchor: `#${SKIP_LINKS_ID.mainContent}`,
        },
        ...(eligibilityTestSkipLink ? [eligibilityTestSkipLink] : []),
        ...(findAClubSkipLink ? [findAClubSkipLink] : []),
        ...(contactUsLink ? [contactUsLink] : []),
        {
          label: 'Pied de page',
          anchor: `#${SKIP_LINKS_ID.footer}`,
        },
      ]}
    />
  );
};

export default SkipLinksWrapper;
