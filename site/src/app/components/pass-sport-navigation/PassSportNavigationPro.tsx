'use client';

import { FOOTER_BRAND_TOP } from '@/app/constants/footer-brand-top';
import Header from '@codegouvfr/react-dsfr/Header';
import { usePathname } from 'next/navigation';
import { navigationItemPro } from './navigation';
import styles from './styles.module.scss';
import { useUpdateList } from '@/app/hooks/accessibility/use-update-list';
import { useRef } from 'react';
import { HEADER_CLASSES } from '@/app/constants/dsfr-classes';
import { useReplaceTitlesByAriaLabels } from '@/app/hooks/accessibility/use-replace-titles-by-aria-labels';
import { useRemoveHeaderThemeControls } from '@/app/hooks/accessibility/use-remove-header-theme-controls';

export default function PassSportNavigationPro() {
  const paths: string | null = usePathname();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const headerContainerRef = useRef<HTMLDivElement | null>(null);

  const isActive = (path: string) => {
    return !!(paths && paths.includes(path));
  };

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
        brandTop={FOOTER_BRAND_TOP}
        operatorLogo={{
          alt: '',
          imgUrl: '/images/pass-sport-logo.svg',
          orientation: 'vertical',
        }}
        serviceTitle="pass Sport"
        serviceTagline="50 euros pour aider les 6-30 ans à faire du sport"
        quickAccessItems={[
          {
            iconId: 'fr-icon-external-link-line',
            text: 'Le Compte Asso',
            linkProps: {
              className: 'fr-btn--icon-right',
              href: 'https://lecompteasso.associations.gouv.fr/',
              'aria-label':
                'Lien externe vers Le Compte Asso https://lecompteasso.associations.gouv.fr/',
            },
          },
          {
            text: 'Je suis un particulier',
            iconId: 'fr-icon-arrow-right-line',
            linkProps: {
              href: '/v2/accueil',
              className: 'fr-btn--tertiary fr-btn--icon-right',
            },
          },
        ]}
        // @ts-ignore
        homeLinkProps={{
          href: '/v2/pro/accueil',
        }}
        navigation={navigationItemPro.map((item) => ({
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
