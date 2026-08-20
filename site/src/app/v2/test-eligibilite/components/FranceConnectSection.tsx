'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';

export default function FranceConnectSection() {
  return <FranceConnectButton url="/api/france-connect/login" plus={false} />;
}
