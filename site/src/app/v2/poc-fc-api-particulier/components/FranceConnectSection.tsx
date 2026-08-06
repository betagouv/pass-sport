'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';

export default function FranceConnectSection() {
  return (
    <FranceConnectButton
      url="/v2/api/poc-fc-api-particulier/login"
      // FranceConnect (not FranceConnect+) for this POC.
      plus={false}
    />
  );
}
