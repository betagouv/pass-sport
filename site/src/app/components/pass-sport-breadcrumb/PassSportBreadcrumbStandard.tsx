'use client';

import styles from './styles.module.scss';

import { Breadcrumb } from '@codegouvfr/react-dsfr/Breadcrumb';
import { usePathname } from 'next/navigation';
import cn from 'classnames';

export const NAVIGATION_ITEM_MAP: { [key: string]: string } = {
  '/v2/une-question': 'Une question ?',
  '/v2/tout-savoir-sur-le-pass-sport': 'Tout savoir sur le pass Sport',
  '/v2/trouver-un-club': 'Trouver un club partenaire',
  '/v2/politique-de-confidentialite': 'Politique de confidentialité',
  '/v2/mentions-legales': 'Mentions légales',
  '/v2/code/scan': 'Mon pass Sport',
  '/v2/plan-du-site': 'Plan du site',
  '/v2/accessibilite': 'Accessibilité',
};

export default function PassSportBreadcrumbStandard() {
  const paths = usePathname();

  const internalRoutes = [
    '/',
    '/v2/accueil',
    '/v2/test-eligibilite-base',
    '/v2/test-eligibilite',
    '/v2/test-ou-code',
  ];

  // Quick & dirty for now, because /v2/code/scan contains a path parameter
  const isOnQRPage = paths && paths.startsWith('/v2/code/scan');

  if (!paths || internalRoutes.includes(paths) || isOnQRPage) {
    return null;
  }

  if (!!NAVIGATION_ITEM_MAP[paths]) {
    return (
      <div className={cn(styles.container)}>
        <div>
          <Breadcrumb
            homeLinkProps={{ href: '/v2/accueil' }}
            currentPageLabel={NAVIGATION_ITEM_MAP[paths]}
            segments={[]}
          />
        </div>
      </div>
    );
  }

  const pathNames = paths.split('/');
  const clubName = decodeURIComponent(pathNames[pathNames.length - 1]);

  return (
    <div className={styles.container}>
      <Breadcrumb
        homeLinkProps={{ href: '/v2/accueil' }}
        currentPageLabel={clubName}
        segments={[
          {
            label: 'Trouver un club partenaire',
            linkProps: { href: '/v2/trouver-un-club' },
          },
        ]}
      />
    </div>
  );
}
