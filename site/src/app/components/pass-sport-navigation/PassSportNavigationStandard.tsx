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
import { displayOfficialClosingBanner } from '@/utils/date';
import Notice from '@codegouvfr/react-dsfr/Notice';
import Link from 'next/link';
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';

export default function PassSportNavigation() {
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
      {!displayOfficialClosingBanner() && (
        <Notice
          severity="warning"
          title={
            <>
              Exfiltration de données :{' '}
              <Link href="/v2/communication">situation et recommandations</Link>
            </>
          }
        />
      )}

      {displayOfficialClosingBanner() && (
        <Notice severity="info" title="La campagne pass Sport 2025 est terminée." />
      )}

      <Notice
        severity="warning"
        title={
          <>
            <strong>Évaluation en cours du dispositif pass Sport</strong> : vous pourriez recevoir,
            par SMS ou par e-mail, une invitation de l&apos;Institut National de la Jeunesse et de
            l&apos;Education Populaire (INJEP) à participer à une enquête concernant votre pratique
            sportive. L&apos;enquête est en cours du 17 mars au 12 avril 2026 inclus.
            <br />
            <br />
            <strong>Attention</strong> : Aucune donnée personnelle sensible (coordonnées bancaires,
            mot de passe, etc.) ne vous sera demandée dans le cadre de ce sondage. En cas de doute
            sur l&apos;expéditeur, nous vous invitons à nous contacter via{' '}
            <Link href={`/v2/une-question?${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}>
              ce formulaire
            </Link>
            .
          </>
        }
      />
    </div>
  );
}
