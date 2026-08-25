'use client';

import { FOOTER_BRAND_TOP } from '@/app/constants/footer-brand-top';
import Header from '@codegouvfr/react-dsfr/Header';
import { usePathname } from 'next/navigation';
import { navigationItemStandard } from './navigation';
import styles from './styles.module.scss';
import { useUpdateList } from '@/app/hooks/accessibility/use-update-list';
import React, { useRef } from 'react';
import { HEADER_CLASSES } from '@/app/constants/dsfr-classes';
import { useReplaceTitlesByAriaLabels } from '@/app/hooks/accessibility/use-replace-titles-by-aria-labels';
import { useRemoveHeaderThemeControls } from '@/app/hooks/accessibility/use-remove-header-theme-controls';
import Notice from '@codegouvfr/react-dsfr/Notice';

interface Props {
  // POC FranceConnect + API Particulier: while a session is live (read server-side in
  // the root layout), the header shows the user's civil name — qualification criterion
  // 18 asks that a connected user can tell at a glance who they are connected as — plus
  // a "Se déconnecter" quick-access item. Undefined means no session.
  pocUserName?: string;
}

// Route that destroys the POC session then server-redirects to the FranceConnect
// session/end endpoint (mode 2). Uses a Button quick-access item + a full-page
// navigation on purpose: the registered DSFR Link is next/link, whose client-side
// RSC fetch cannot follow the external FranceConnect redirect.
const POC_LOGOUT_URL = '/api/france-connect/logout';

export default function PassSportNavigation({ pocUserName }: Props) {
  const paths: string | null = usePathname();

  const isActive = (path: string) => {
    return !!(paths && paths.includes(path));
  };

  const headerRef = useRef<HTMLDivElement | null>(null);
  const headerContainerRef = useRef<HTMLDivElement | null>(null);

  useUpdateList({
    parentRef: headerRef,
    role: 'none',
    listSelector: HEADER_CLASSES.list,
  });

  useReplaceTitlesByAriaLabels({
    parentRef: headerRef,
    elementsToUpdate: [
      {
        selector: HEADER_CLASSES.closeButton,
        ariaLabel: 'Fermer le menu de navigation',
      },
      {
        selector: HEADER_CLASSES.menuButton,
        ariaLabel: 'Menu de navigation',
      },
    ],
  });

  useRemoveHeaderThemeControls(headerContainerRef);

  return (
    <div ref={headerContainerRef}>
      <Header
        ref={headerRef}
        className={styles.header}
        classes={{
          service: styles.service,
        }}
        brandTop={FOOTER_BRAND_TOP}
        serviceTitle="pass Sport"
        serviceTagline="Une aide financière pour encourager la pratique des jeunes"
        // @ts-ignore
        homeLinkProps={{
          href: '/v2/accueil',
          'aria-label': `Retourner sur la page d'accueil du pass Sport`,
        }}
        quickAccessItems={
          pocUserName
            ? [
                // Plain node rather than a quick-access link: there is no account space
                // to navigate to, so the identity must read as a status, not a control.
                <p key="poc-identity" className={styles['poc-identity']}>
                  <span className="fr-icon-account-line" aria-hidden="true" />
                  <span>
                    Connecté en tant que <strong>{pocUserName}</strong>
                  </span>
                </p>,
                {
                  iconId: 'fr-icon-logout-box-r-line',
                  text: 'Se déconnecter',
                  buttonProps: {
                    onClick: () => {
                      window.location.assign(POC_LOGOUT_URL);
                    },
                  },
                },
              ]
            : []
        }
        navigation={navigationItemStandard.map((item) => ({
          isActive: isActive(item.link),
          linkProps: {
            href: item.link,
            target: !!item.isExternal ? '_blank' : '_self',
            ...(item.ariaLabel && { 'aria-label': item.ariaLabel }),
            ...(item.title && { title: item.title }),
          },
          text: item.text,
        }))}
      />

      <Notice
        severity="info"
        title="La campagne pass Sport 2026-2027 ouvre le 1er septembre 2026."
      />
    </div>
  );
}
