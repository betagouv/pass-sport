import './globals.scss';
import SkipLinksWrapper from '@/app/components/skip-links-wrapper/SkipLinksWrapper';
import { Metadata } from 'next';
import { headers } from 'next/headers';
import React from 'react';
import Matomo from './Matomo';
import PassSportFooter from './components/pass-sport-footer/PassSportFooter';
import TarteAuCitron from './components/tarte-au-citron/tarte-au-citron';
import { DsfrHead, getHtmlAttributes } from '@/dsfr/DsfrHead';
import { DsfrProvider } from '@/dsfr/DsfrProvider';
import PassSportNavigationStandard from './components/pass-sport-navigation/PassSportNavigationStandard';
import PassSportBreadcrumbStandard from '@/app/components/pass-sport-breadcrumb/PassSportBreadcrumbStandard';
import { StartDsfrOnHydration } from '@codegouvfr/react-dsfr/next-app-router';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les particuliers",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = 'fr';
  const headerList = await headers();
  const nonce = headerList.get('X-Nonce') ?? undefined;

  return (
    <html {...getHtmlAttributes({ lang })}>
      <head suppressHydrationWarning>
        <DsfrHead nonce={nonce} />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
        {process.env.NEXT_PUBLIC_ENV === 'production' && <Matomo />}
        <TarteAuCitron nonce={nonce} />
      </head>

      <body>
        <StartDsfrOnHydration />
        <SkipLinksWrapper />
        <PassSportNavigationStandard />
        <PassSportBreadcrumbStandard />
        <DsfrProvider lang={lang}>{children}</DsfrProvider>
        <PassSportFooter />
      </body>
    </html>
  );
}
