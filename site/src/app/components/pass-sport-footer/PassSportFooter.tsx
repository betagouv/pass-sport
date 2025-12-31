'use client';

import Footer, { type FooterProps } from '@codegouvfr/react-dsfr/Footer';
import { FOOTER_BRAND_TOP } from '@/app/constants/footer-brand-top';
import styles from './styles.module.scss';

import lcaLogo from '@/images/footer/logo-lca.webp';
import menjLogo from '@/images/footer/menj-logo.svg';
import passSportLogo from '@/images/pass-sport-logo.svg';
import decathlonLogo from '@/images/footer/decathlon.svg';
import intersportLogo from '@/images/footer/intersport-logo.svg';
import logoCosmos from '@/images/footer/logo-cosmos.svg';
import paralympiqueLogo from '@/images/footer/france-paralympique.svg';
import crousLogo from '@/images/footer/crous-logo.webp';
import cnosfLogo from '@/images/footer/cnosf-logo.svg';
import msaLogo from '@/images/footer/msa-logo.svg';
import dinumLogo from '@/images/footer/dinum-logo.webp';
import helloAssoLogo from '@/images/footer/hello-asso-logo.svg';
import cnafLogo from '@/images/footer/cnaf-logo.webp';
import fneaplLogo from '@/images/footer/fneapl-logo.webp';
import unionSportCycleLogo from '@/images/footer/union-sport-cycle-logo.webp';
import neonessLogo from '@/images/footer/logo-reseau-kc-neo.webp';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { useRef } from 'react';
import { useUpdateHeadings } from '@/app/hooks/accessibility/use-update-headings';
import { FOOTER_CLASSES } from '@/app/constants/dsfr-classes';
import { isPasSportClosed, shouldDisplayChatbot } from '@/utils/date';
import { CHATBOT_EXTERNAL_URL, CHATBOT_EXTERNAL_URL_TITLE } from '@/app/constants/urls';

export default function PassSportFooter() {
  const footerRef = useRef<HTMLDivElement>(null);

  useUpdateHeadings({
    parentRef: footerRef,
    level: 1,
    headingSelectors: [FOOTER_CLASSES.partnersTitle],
  });

  const partnersLogos: FooterProps.PartnersLogos = {
    main: {
      // @ts-ignore
      linkProps: {
        'aria-label':
          "Ouvrir une nouvelle fenêtre vers le Ministere de l'education nationale et de la jeunesse, liberté, égalité, fraternité",
        href: 'https://www.education.gouv.fr/',
      },
      // non-transparent logo
      imgUrl: menjLogo.src,
      alt: `Ministere de l'education nationale et de la jeunesse, liberté, égalité, fraternité`,
    },
    sub: [
      {
        // @ts-ignore
        linkProps: {
          'aria-label':
            'Ouvrir une nouvelle fenêtre vers le Comité National Olympique et Sportif Français',
          href: 'https://cnosf.franceolympique.com/',
        },
        imgUrl: cnosfLogo.src,
        alt: 'Comité National Olympique et Sportif Français',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers le MSA',
          href: 'https://www.msa.fr/lfp/accueil',
        },
        imgUrl: msaLogo.src,
        alt: 'MSA - La sécurité sociale agricole',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label':
            'Ouvrir une nouvelle fenêtre vers la DINUM - La direction interministérielle du numérique',
          href: 'https://www.numerique.gouv.fr/dinum/',
        },
        imgUrl: dinumLogo.src,
        alt: 'DINUM - La direction interministérielle du numérique',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers France Paralympique',
          href: 'https://france-paralympique.fr/',
        },
        imgUrl: paralympiqueLogo.src,
        alt: 'France Paralympique',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers lescrous.fr',
          href: 'https://www.lescrous.fr/',
        },
        imgUrl: crousLogo.src,
        alt: 'les CROUS',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Decathlon',
          href: 'https://www.decathlon.fr/',
        },
        imgUrl: decathlonLogo.src,
        alt: 'Decathlon',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Neoness',
          href: 'https://www.neoness.fr/',
        },
        imgUrl: neonessLogo.src,
        alt: 'Keepcool Neoness Metabolik',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Intersport',
          href: 'https://www.intersport.fr/',
        },
        imgUrl: intersportLogo.src,
        alt: 'Intersport',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Le Compte Asso',
          href: 'https://lecompteasso.associations.gouv.fr/',
        },
        imgUrl: lcaLogo.src,
        alt: 'Le Compte Asso',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Union Sport & Cycle',
          href: 'https://www.unionsportcycle.com/accueil',
        },
        imgUrl: unionSportCycleLogo.src,
        alt: 'Union Sport & Cycle',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Hello asso',
          href: 'https://www.helloasso.com/secteurs/clubs-sportifs',
        },
        imgUrl: helloAssoLogo.src,
        alt: 'Hello asso',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label':
            'Ouvrir une nouvelle fenêtre vers la Caisse nationale allocations familiales',
          href: 'https://www.caf.fr/',
        },
        imgUrl: cnafLogo.src,
        alt: 'Caisse nationale allocations familiales',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label':
            'Ouvrir une nouvelle fenêtre vers la Fédération Nationale des Entreprises des Activités Physiques de Loisirs',
          href: 'https://www.active-fneapl.fr/',
        },
        imgUrl: fneaplLogo.src,
        alt: 'Fédération Nationale des Entreprises des Activités Physiques de Loisirs',
      },
      {
        // @ts-ignore
        linkProps: {
          'aria-label': 'Ouvrir une nouvelle fenêtre vers Cosmos Sports',
          href: 'https://www.cosmos-sports.fr/',
        },
        imgUrl: logoCosmos.src,
        alt: 'Cosmos sports',
      },
    ],
  };

  // @ts-ignore
  const homeLinkProps: NonNullable<FooterProps['homeLinkProps']> = {
    href: '/v2/accueil',
  };

  const operatorLogo: NonNullable<FooterProps['operatorLogo']> = {
    orientation: 'horizontal',
    imgUrl: passSportLogo.src,
    alt: `pass Sport`,
  };

  const bottomItems: FooterProps.BottomItem[] = [
    {
      text: 'Mentions légales',
      linkProps: {
        href: '/v2/mentions-legales',
      },
    },
    {
      text: 'Données personnelles',
      linkProps: {
        href: '/v2/politique-de-confidentialite',
      },
    },
    // todo: enable later
    // {
    //   text: 'Budget',
    //   linkProps: {
    //     href: '/v2/budget',
    //   },
    // },
    {
      text: 'Gestion des cookies',
      linkProps: {
        href: '#',
        'aria-label': 'Ouvrir le panneau de gestion des cookies',
        onClick: () => {
          if (window?.tarteaucitron) {
            window?.tarteaucitron?.userInterface?.openPanel();
          }
        },
      },
    },
    {
      text: 'Plan du site',
      linkProps: {
        href: '/v2/plan-du-site',
      },
    },
  ];

  // @ts-ignore
  const linkList: FooterProps.LinkList.List = [
    {
      links: [
        {
          text: 'Accueil',
          linkProps: {
            href: '/v2/accueil',
          },
        },
        ...((!isPasSportClosed()
          ? [
              {
                text: 'Jeunes et parents',
                linkProps: {
                  href: '/v2/jeunes-et-parents',
                },
              },
              {
                text: 'Structures sportives',
                linkProps: {
                  href: '/v2/structures',
                },
              },
            ]
          : []) as [FooterProps.LinkList.Link, FooterProps.LinkList.Link]),
        {
          text: 'Trouver un club partenaire',
          linkProps: {
            href: '/v2/trouver-un-club',
          },
        },
      ],
    },
    {
      links: [
        {
          text: 'Partenaires',
          linkProps: {
            href: '/v2/partenaires',
          },
        },
        {
          text: 'Une question ?',
          linkProps: {
            href: '/v2/une-question',
          },
        },
      ],
    },
    {
      links: [
        ...((shouldDisplayChatbot()
          ? [
              {
                text: CHATBOT_EXTERNAL_URL_TITLE,
                linkProps: {
                  href: CHATBOT_EXTERNAL_URL,
                  target: '_blank',
                  title: `${CHATBOT_EXTERNAL_URL_TITLE} (nouvelle fenêtre)`,
                },
              },
            ]
          : []) as [FooterProps.LinkList.Link]),
      ],
    },
  ];

  const domains = ['legifrance.gouv.fr', 'info.gouv.fr', 'service-public.fr', 'data.gouv.fr'];

  return (
    <Footer
      ref={footerRef}
      id={SKIP_LINKS_ID.footer}
      classes={{
        logo: styles['partners-logo'],
        root: styles.root,
        partnersSub: styles['partners-sub'],
      }}
      homeLinkProps={homeLinkProps}
      operatorLogo={operatorLogo}
      // todo: To update later
      // partnersLogos={partnersLogos}
      bottomItems={bottomItems}
      linkList={linkList}
      brandTop={FOOTER_BRAND_TOP}
      accessibility="fully compliant"
      accessibilityLinkProps={{
        href: '/v2/accessibilite',
      }}
      domains={domains}
    />
  );
}
