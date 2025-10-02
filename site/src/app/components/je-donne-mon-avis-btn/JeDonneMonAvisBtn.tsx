import Image from 'next/image';
import { IS_PRODUCTION_ENV } from '@/app/constants/env';
import { useCallback } from 'react';
import { push } from '@socialgouv/matomo-next';
import Link from 'next/link';

export type JeDonneMonAvisBtnProps = {
  isSuccess: boolean;
};

export function JeDonneMonAvisBtn({ isSuccess }: JeDonneMonAvisBtnProps) {
  const url = IS_PRODUCTION_ENV
    ? 'https://jedonnemonavis.numerique.gouv.fr/Demarches/3659?button=3942'
    : '';

  const onLinkClick = useCallback(() => {
    push([
      'trackEvent',
      'Je donne mon avis',
      'Link clicked',
      isSuccess ? 'Simplified eligibility test success' : 'Simplified eligibility test failure',
    ]);
  }, [isSuccess]);

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
