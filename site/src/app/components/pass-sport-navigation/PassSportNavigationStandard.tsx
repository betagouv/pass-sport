'use client';

import { FOOTER_BRAND_TOP } from '@/app/constants/footer-brand-top';
import Header from '@codegouvfr/react-dsfr/Header';
import { usePathname } from 'next/navigation';
import { navigationItemStandard } from './navigation';
import styles from './styles.module.scss';
import { useUpdateList } from '@/app/hooks/accessibility/use-update-list';
import React, { useCallback, useRef } from 'react';
import { HEADER_CLASSES } from '@/app/constants/dsfr-classes';
import { useReplaceTitlesByAriaLabels } from '@/app/hooks/accessibility/use-replace-titles-by-aria-labels';
import { useRemoveHeaderThemeControls } from '@/app/hooks/accessibility/use-remove-header-theme-controls';
import { push } from '@socialgouv/matomo-next';
import { isPasSportClosed } from '@/utils/date';
import Notice from '@codegouvfr/react-dsfr/Notice';
import Link from 'next/link';

export default function PassSportNavigation() {
  const paths: string | null = usePathname();

  const isActive = (path: string) => {
    return !!(paths && paths.includes(path));
  };

  const headerRef = useRef<HTMLDivElement | null>(null);
  const headerContainerRef = useRef<HTMLDivElement | null>(null);
  const onNoticeClick = useCallback(() => {
    push(['trackEvent', 'Notice banner', 'Clicked', 'Link to forms']);
  }, []);

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
        severity="warning"
        title={
          <>
            La récupération des codes pass Sport est momentanément indisponible. Veuillez consulter{' '}
            <Link
              href="https://www.sports.gouv.fr/exfiltration-de-donnees-provenant-d-un-des-systemes-d-information-du-ministere-10048"
              title="Lien vers le communiqué de presse"
            >
              cette page.
            </Link>
          </>
        }
      />
      {isPasSportClosed() && (
        <Notice severity="info" title="La campagne pass Sport 2025 est terminée." />
      )}
    </div>
  );
}
