'use client';

import styles from './styles.module.scss';

import { Breadcrumb } from '@codegouvfr/react-dsfr/Breadcrumb';
import { usePathname } from 'next/navigation';
import cn from 'classnames';
import { useIsNotFound } from '@/app/hooks/use-is-not-found';
import { isPasSportClosed } from '@/utils/date';

export const NAVIGATION_ITEM_MAP: { [key: string]: string } = {
  '/v2/une-question': 'Une question ?',
  '/v2/tout-savoir-sur-le-pass-sport': 'Tout savoir sur le pass Sport',
  '/v2/trouver-un-club': 'Trouver un club partenaire',
  '/v2/politique-de-confidentialite': 'Politique de confidentialité',
  '/v2/mentions-legales': 'Mentions légales',
  '/v2/code/scan': 'Mon pass Sport',
  '/v2/plan-du-site': 'Plan du site',
  '/v2/accessibilite': 'Accessibilité',
  '/v2/budget': 'Budget',
};

export default function PassSportBreadcrumbStandard() {
  const paths = usePathname();
  const passSportClosed = isPasSportClosed();

  const internalRoutes = [
    '/',
    '/v2/accueil',
    !passSportClosed ? '/v2/test-eligibilite-base' : null,
    !passSportClosed ? '/v2/test-eligibilite' : null,
    !passSportClosed ? '/v2/test-ou-code' : null,
  ].filter((route): route is string => route !== null);

  const notFound = useIsNotFound({
    internalRoutes,
    navigationItemsMap: Object.keys(NAVIGATION_ITEM_MAP),
  });

  // Quick & dirty for now, because /v2/code/scan contains a path parameter
  const isOnQRPage = paths && paths.startsWith('/v2/code/scan');

  if (!paths || internalRoutes.includes(paths) || isOnQRPage || notFound) {
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
