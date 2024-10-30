'use client';

import styles from './styles.module.scss';

import { Breadcrumb } from '@codegouvfr/react-dsfr/Breadcrumb';
import { usePathname } from 'next/navigation';
import cn from 'classnames';
import { useIsNotFound } from '@/app/hooks/use-is-not-found';

export const NAVIGATION_ITEM_MAP: { [key: string]: string } = {
  '/v2/pro/une-question': 'Une question ?',
  '/v2/pro/tout-savoir-sur-le-pass-sport': 'Tout savoir sur le pass Sport',
  '/v2/pro/trouver-un-club': 'Trouver une structure partenaire',
  '/v2/pro/ressources': 'Ressources',
  '/v2/pro/plan-du-site': 'Plan du site',
  '/v2/politique-de-confidentialite': 'Politique de confidentialité',
  '/v2/mentions-legales': 'Mentions légales',
  '/v2/accessibilite': 'Accessibilité',
};

export default function PassSportBreadcrumbPro() {
  const paths = usePathname();
  const internalRoutes = ['/', '/v2/pro/accueil'];
  const notFound = useIsNotFound({
    internalRoutes,
    navigationItemsMap: Object.keys(NAVIGATION_ITEM_MAP),
  });

  if (!paths || internalRoutes.includes(paths) || notFound) {
    return null;
  }

  if (!!NAVIGATION_ITEM_MAP[paths]) {
    return (
      <div className={cn(styles.container, styles['container--pro'])}>
        <div className={styles['container__breadcrumb']}>
          <Breadcrumb
            homeLinkProps={{ href: '/v2/pro/accueil' }}
            currentPageLabel={NAVIGATION_ITEM_MAP[paths]}
            segments={[]}
            classes={{
              root: styles['container--pro'],
              collapse: styles['container--pro'],
            }}
          />
        </div>
      </div>
    );
  }

  const pathNames = paths.split('/');
  const clubName = decodeURIComponent(pathNames[pathNames.length - 1]);

  return (
    <div className={cn(styles.container, styles['container--pro'])}>
      <Breadcrumb
        homeLinkProps={{ href: '/v2/pro/accueil' }}
        currentPageLabel={clubName}
        segments={[
          {
            label: 'Trouver une structure partenaire',
            linkProps: { href: '/v2/pro/trouver-un-club' },
          },
        ]}
        classes={{
          root: styles['container--pro'],
          collapse: styles['container--pro'],
        }}
      ></Breadcrumb>
    </div>
  );
}
