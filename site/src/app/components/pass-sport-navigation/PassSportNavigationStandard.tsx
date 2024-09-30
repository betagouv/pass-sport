'use client';

import { FOOTER_BRAND_TOP } from '@/app/constants/footer-brand-top';
import Header from '@codegouvfr/react-dsfr/Header';
import { usePathname } from 'next/navigation';
import { navigationItemStandard } from './navigation';
import styles from './styles.module.scss';
import { useUpdateList } from '@/app/hooks/accessibility/use-update-list';
import { useRef } from 'react';
import { HEADER_CLASSES } from '@/app/constants/dsfr-classes';
import { useReplaceTitlesByAriaLabels } from '@/app/hooks/accessibility/use-replace-titles-by-aria-labels';
import { useRemoveHeaderThemeControls } from '@/app/hooks/accessibility/use-remove-header-theme-controls';

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
        operatorLogo={{
          alt: `Logo du pass Sport`,
          imgUrl: '/images/pass-sport-logo.svg',
          orientation: 'vertical',
        }}
        serviceTitle="pass Sport"
        serviceTagline="50 euros pour aider les 6-30 ans à faire du sport"
        quickAccessItems={[
          {
            text: 'Je suis une structure partenaire',
            iconId: 'fr-icon-arrow-right-line',
            linkProps: {
              href: '/v2/pro/accueil',
              className: 'fr-btn--tertiary fr-btn--icon-right',
            },
          },
        ]}
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
    </div>
  );
}
