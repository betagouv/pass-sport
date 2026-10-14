'use client';

import { FranceConnectButton } from '@codegouvfr/react-dsfr/FranceConnectButton';
import { push } from '@socialgouv/matomo-next';
import { useCallback } from 'react';
import { useAskConsentForSupport } from '@/app/v2/test-eligibilite/hooks/use-ask-consent-for-support';

const LOGIN_PATH = '/api/france-connect/login';
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN;

export default function FranceConnectSection() {
  // Consent must be given before the login: the callback is where the support cookie is marked
  useAskConsentForSupport();

  const onFranceConnectClick = useCallback(() => {
    push(['trackEvent', 'Eligibility Test Button', 'Clicked', 'FranceConnect button']);
    window.location.assign(new URL(LOGIN_PATH, BASE_DOMAIN));
  }, []);

  return <FranceConnectButton plus={false} onClick={onFranceConnectClick} />;
}
