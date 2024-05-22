import React from 'react';
import styles from './styles.module.scss';

type NavigationItem = {
  link: string;
  text: string | JSX.Element;
  isExternal?: boolean;
};

export const navigationItemStandard: NavigationItem[] = [
  {
    link: '/v2/accueil',
    text: (
      <>
        <span className="fr-pr-1w ri-home-line" aria-hidden="true"></span>
        Accueil
      </>
    ),
  },
  {
    link: '/v2/tout-savoir-sur-le-pass-sport',
    text: (
      <>
        <span className={styles['menu-item-spacer']}>
          <span aria-hidden="true"></span>
        </span>
        Tout savoir sur le pass Sport
      </>
    ),
  },
  { link: '/v2/trouver-un-club', text: 'Trouver un club partenaire' },
  { link: '/v2/une-question', text: 'Une question ?' },
  {
    link: 'https://lecompteasso.associations.gouv.fr/carto/dashboard',
    isExternal: true,
    text: (
      <>
        <div className={styles['menu-item-spacer']}>
          <span aria-hidden="true"></span>
        </div>
        Tableau de bord
      </>
    ),
  },
];

export const navigationItemPro: NavigationItem[] = [
  {
    link: '/v2/pro/accueil',
    text: (
      <>
        <span className="fr-pr-1w ri-home-line" aria-hidden="true"></span>
        Accueil
      </>
    ),
  },
  {
    link: '/v2/pro/tout-savoir-sur-le-pass-sport',
    text: (
      <>
        <div className={styles['menu-item-spacer']}>
          <span aria-hidden="true"></span>
        </div>
        Tout savoir sur le pass Sport
      </>
    ),
  },
  { link: '/v2/pro/trouver-un-club', text: 'Carte des structures partenaires' },
  { link: '/v2/pro/une-question', text: 'Une question ?' },
  {
    link: 'https://lecompteasso.associations.gouv.fr/carto/dashboard',
    isExternal: true,
    text: (
      <>
        <div className={styles['menu-item-spacer']}>
          <span aria-hidden="true"></span>
        </div>
        Tableau de bord
      </>
    ),
  },
];
