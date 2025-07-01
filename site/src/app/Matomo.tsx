'use client';
import init, { push } from '@socialgouv/matomo-next';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function Matomo() {
  const isInitialLoad = useRef(true);

  const transformQrCodeUrl = (): { isCustom: boolean; url: string } => {
    const { pathname, href } = window.location;
    let regex = /\/code\/scan.*/;
    const urlMatchRegex = regex.test(pathname);

    if (urlMatchRegex) {
      return {
        isCustom: true,
        url: pathname.replace(regex, `/code/scan`),
      };
    }

    return {
      isCustom: false,
      url: href,
    };
  };

  // Initialize matomo. init() will also send the current page viewed to matomo server
  useEffect(() => {
    init({
      url: process.env.NEXT_PUBLIC_MATOMO_URL || '',
      siteId: process.env.NEXT_PUBLIC_MATOMO_SITE_ID || '',
      onInitialization: () => {
        const { isCustom, url } = transformQrCodeUrl();

        if (isCustom) {
          push(['setCustomUrl', url]);
        }
      },
      disableCookies: true,
    });
  }, []);

  const location = usePathname();
  const [previousURL, setPreviousURL] = useState<string>();

  // Track navigation from one page to another for SPA
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
    } else {
      if (previousURL) {
        push(['setReferrerUrl', previousURL]);
      }

      const { isCustom, url } = transformQrCodeUrl();

      if (isCustom) {
        push(['setCustomUrl', url]);
      }

      push(['trackPageView']);
      setPreviousURL(url);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  return <></>;
}
