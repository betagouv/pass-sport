import React from 'react';
import styles from './styles.module.scss';
import { CHATBOT_EXTERNAL_URL, CHATBOT_EXTERNAL_URL_TITLE } from '@/app/constants/urls';
import { shouldDisplayChatbot } from '@/utils/date';

type NavigationItem = {
  link: string;
  text: string | JSX.Element;
  isExternal?: boolean;
  title?: string;
  ariaLabel?: string;
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
    link: '/v2/jeunes-et-parents',
    text: 'Jeunes et parents',
  },
  {
    link: '/v2/structures',
    text: 'Structures',
  },
  {
    link: '/v2/trouver-un-club',
    text: 'Trouver un club partenaire',
  },
  {
    link: '/v2/une-question',
    text: 'Une question ?',
  },
  ...(shouldDisplayChatbot()
    ? [
        {
          link: CHATBOT_EXTERNAL_URL,
          isExternal: true,
          ariaLabel: `${CHATBOT_EXTERNAL_URL_TITLE} (nouvelle fenêtre)`,
          text: (
            <>
              <div className={styles['menu-item-spacer']}>
                <span aria-hidden />
              </div>
              {CHATBOT_EXTERNAL_URL_TITLE}
            </>
          ),
        },
      ]
    : []),
];
