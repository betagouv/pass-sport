'use client';

import cn from 'classnames';
import styles from './styles.module.scss';
import { Badge } from '@codegouvfr/react-dsfr/Badge';
import Button from '@codegouvfr/react-dsfr/Button';
import { push } from '@socialgouv/matomo-next';

interface Props {
  redirectionUrl: string;
}

const ProContent = ({ redirectionUrl }: Props) => {
  const _redirectionUrl = new URL(redirectionUrl).toString();
  const onRedirectionClick = () => {
    push(['trackEvent', 'LCA redirection', 'Clicked', 'QR Recap page']);
  };

  return (
    <div
      className={cn(
        styles['container-pro'],
        'fr-grid-row',
        'fr-grid-row--middle',
        'fr-grid-row--center',
        'fr-py-4w',
        'fr-px-2w',
      )}
    >
      <div className={cn(styles['container-pro__content'])}>
        <Badge className={cn(styles['container-pro__content-badge'], 'fr-mb-3v')}>
          Structures partenaires
        </Badge>
        <h1 className={cn(styles['container-pro__content-title'], 'fr-h6')}>
          Je valide le pass Sport de mon adhérent
        </h1>
        <p className="fr-text--sm fr-text-default--grey">
          Identifiez-vous sur Le Compte Asso pour valider ce pass Sport.
        </p>

        <Button
          aria-label="Ouvrir une nouvelle fenêtre vers Le Compte Asso pour saisir ce pass Sport"
          priority="secondary"
          size="small"
          linkProps={{
            href: _redirectionUrl,
            target: '_blank',
            onClick: onRedirectionClick,
          }}
        >
          Saisir ce pass Sport sur le compte Asso
        </Button>
      </div>
    </div>
  );
};

export default ProContent;
