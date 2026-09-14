'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import { push } from '@socialgouv/matomo-next';
import { useCallback } from 'react';

export default function NoFranceConnectSection() {
  const onNoFranceConnectClick = useCallback(() => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'Hors FranceConnect button']);
  }, []);

  return (
    <Button
      priority="secondary"
      linkProps={{
        href: '/v2/test-eligibilite/hors-france-connect',
        onClick: onNoFranceConnectClick,
      }}
    >
      Faire la demande hors FranceConnect
    </Button>
  );
}
