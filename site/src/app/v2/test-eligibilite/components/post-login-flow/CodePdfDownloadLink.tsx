'use client';

import { useCallback } from 'react';
import { push } from '@socialgouv/matomo-next';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';

type Props = {
  href: string;
  filename: string;
};

export default function CodePdfDownloadLink({ href, filename }: Props) {
  const onDownloadClick = useCallback(() => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'Code PDF download']);
  }, []);

  return (
    <DownloadLink
      details="PDF ~ 582 kB"
      label="Télécharger le code"
      href={href}
      filename={filename}
      onClick={onDownloadClick}
    />
  );
}
