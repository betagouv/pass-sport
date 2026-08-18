'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';

export default function FranceConnectSection() {
  return <FranceConnectButton url="/v2/api/france-connect/login" plus={false} />;
}
