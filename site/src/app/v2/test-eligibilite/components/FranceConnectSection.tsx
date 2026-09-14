'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';
import { push } from '@socialgouv/matomo-next';
import { useCallback } from 'react';

const LOGIN_PATH = '/api/france-connect/login';
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN;

export default function FranceConnectSection() {
  const onFranceConnectClick = useCallback(() => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'FranceConnect button']);
    window.location.assign(new URL(LOGIN_PATH, BASE_DOMAIN));
  }, []);

  return <FranceConnectButton plus={false} onClick={onFranceConnectClick} />;
}
