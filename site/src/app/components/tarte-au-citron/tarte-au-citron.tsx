'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  PASS_SPORT_URI,
  SUPPORT_COOKIE_KEY,
  SUPPORT_COOKIE_NAME,
  SUPPORT_COOKIE_READ_MORE_URL,
  WAITING_STATE,
} from '@/app/constants/cookie-manager';
import { useEnhanceCookieManagerAccessibility } from '@/app/hooks/accessibility/use-enhance-cookie-manager-accessibility';

// Temporary custom data attributes to apply css when using our own stylesheets
export const EXTERNAL_SHEET_DATA_KEY = 'tac';
export const EXTERNAL_SHEET_IDENTIFIER = 'external-sheet';

export const TarteAuCitron = () => {
  const domain = process.env.NEXT_PUBLIC_TARTEAUCITRON_DOMAIN;
  const pathname = usePathname();

  useEnhanceCookieManagerAccessibility();

  useEffect(() => {
    const isModalRendered = document.getElementById('tarteaucitron');
    const tarteaucitron = window.tarteaucitron;

    if (tarteaucitron && isModalRendered) {
      tarteaucitron.triggerJobsAfterAjaxCall?.();
    }
  }, [pathname]);

  if (!domain) {
    console.error('Environment variable NEXT_PUBLIC_TARTEAUCITRON_DOMAIN is missing');
    return null;
  }

  return (
    <Script
      src={`https://tarteaucitron.io/load.js?domain=${domain}&uuid=19b13211bfb1bd1efd6f804a26674ed864265114`}
      strategy="afterInteractive"
      onLoad={() => {
        const tac = window.tarteaucitron;

        if (tac) {
          tac.services[SUPPORT_COOKIE_KEY] = {
            key: SUPPORT_COOKIE_KEY,
            type: 'support',
            name: SUPPORT_COOKIE_NAME,
            needConsent: true,
            cookies: [SUPPORT_COOKIE_KEY],
            defaultState: WAITING_STATE,
            readmoreLink: SUPPORT_COOKIE_READ_MORE_URL,
            uri: PASS_SPORT_URI,
            js: () => {},
            fallback: () => {},
          };

          tac?.initEvents.loadEvent(false);
        }

        window.addEventListener('tac.root_available', function () {
          const tac = window.tarteaucitron;

          if (tac) {
            (tac.job = tac.job || []).push(SUPPORT_COOKIE_KEY);

            // Condition check in order to not break
            // stylesheet for people who don't have the latest version of the TAC CDN script
            if (tac.parameters.useExternalCss) {
              document.body.dataset[EXTERNAL_SHEET_DATA_KEY] = EXTERNAL_SHEET_IDENTIFIER;
            }
          }
        });
      }}
    />
  );
};

export default TarteAuCitron;
