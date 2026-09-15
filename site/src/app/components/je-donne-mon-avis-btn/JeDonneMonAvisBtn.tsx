import Image from 'next/image';
import { IS_PRODUCTION_ENV } from '@/app/constants/env';
import { useCallback } from 'react';
import { push } from '@socialgouv/matomo-next';
import Link from 'next/link';

export type JeDonneMonAvisOrigin =
  'simplified-test-eligible' | 'simplified-test-not-eligible' | 'request-sent' | 'not-eligible';

const MATOMO_EVENT_NAME_BY_ORIGIN: Record<JeDonneMonAvisOrigin, string> = {
  'simplified-test-eligible': 'Simplified eligibility test success',
  'simplified-test-not-eligible': 'Simplified eligibility test failure',
  'request-sent': 'Eligibility test request sent',
  'not-eligible': 'Eligibility test not eligible',
};

export type JeDonneMonAvisBtnProps = {
  origin: JeDonneMonAvisOrigin;
};

export function JeDonneMonAvisBtn({ origin }: JeDonneMonAvisBtnProps) {
  const url = IS_PRODUCTION_ENV
    ? 'https://jedonnemonavis.numerique.gouv.fr/Demarches/3659?button=3942'
    : '';

  const onLinkClick = useCallback(() => {
    push(['trackEvent', 'Je donne mon avis', 'Link clicked', MATOMO_EVENT_NAME_BY_ORIGIN[origin]]);
  }, [origin]);

  return (
    <Link
      href={url}
      onClick={onLinkClick}
      target="_blank"
      title="Je donne mon avis - nouvelle fenêtre"
    >
      <Image
        src="https://jedonnemonavis.numerique.gouv.fr/static/bouton-bleu-clair.svg"
        alt="Je donne mon avis"
        width={200}
        height={85}
      />
    </Link>
  );
}
