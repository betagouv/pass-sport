'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';

// Reversed flow: FranceConnect first, no data harvested beforehand. The button
// only starts the OIDC round-trip; aides + commune are collected after login.
export default function FranceConnectSection() {
  return (
    <FranceConnectButton
      url="/v2/api/poc-fc-api-particulier/login"
      // FranceConnect (not FranceConnect+) for this POC.
      plus={false}
    />
  );
}
