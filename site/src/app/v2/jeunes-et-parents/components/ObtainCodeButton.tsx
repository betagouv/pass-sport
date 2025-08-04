'use client';

// Only reason why it is a component is because it uses hook, so cannot place it in the Page.tsx

import { useCallback } from 'react';
import { CODES_OBTAINABLE } from '@/app/constants/env';
import Button from '@codegouvfr/react-dsfr/Button';
import { push } from '@socialgouv/matomo-next';

export default function ObtainCodeButton() {
  const onObtainCodeClicked = useCallback(() => {
    push(['trackEvent', 'Jeunes et parents', 'Click', 'Obtain code link clicked']);
  }, []);

  return (
    CODES_OBTAINABLE && (
      <Button
        className="fr-my-2w"
        linkProps={{
          href: '/v2/test-ou-code',
          onClick: onObtainCodeClicked,
        }}
      >
        Demander le pass Sport
      </Button>
    )
  );
}
