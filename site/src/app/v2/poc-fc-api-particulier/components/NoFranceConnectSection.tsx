'use client';

import Button from '@codegouvfr/react-dsfr/Button';

export default function NoFranceConnectSection() {
  return (
    <Button priority="secondary" linkProps={{ href: '/v2/test-eligibilite' }}>
      Faire la demande sans FranceConnect
    </Button>
  );
}
