'use client';
import init, { push } from '@socialgouv/matomo-next';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { DASHBOARD_URL_PATTERN, maskDashboardKey } from '@/utils/dashboard-url';

export default function Matomo() {
  const pathname = usePathname();
  const previousUrl = useRef<string | null>(null);

  // init() also sends the page view of the landing page. The dashboard URL is its access key: the
  // dashboard is not tracked, and only its masked URL may reach Matomo (outlink tracking)
  useEffect(() => {
    init({
      url: process.env.NEXT_PUBLIC_MATOMO_URL || '',
      siteId: process.env.NEXT_PUBLIC_MATOMO_SITE_ID || '',
      disableCookies: true,
      excludeUrlsPatterns: [DASHBOARD_URL_PATTERN],
      onInitialization: () => {
        if (DASHBOARD_URL_PATTERN.test(window.location.pathname)) {
          push(['setCustomUrl', maskDashboardKey(window.location.href)]);
        }
      },
    });
  }, []);

  // matomo.js reads the URL and the title only once, when it loads: every client-side navigation
  // has to hand them over, the title one tick later so that Next.js has had time to update it
  useEffect(() => {
    const currentUrl = window.location.href;

    if (previousUrl.current === null || previousUrl.current === currentUrl) {
      previousUrl.current = currentUrl;
      return;
    }

    push(['setReferrerUrl', maskDashboardKey(previousUrl.current)]);
    push(['setCustomUrl', maskDashboardKey(currentUrl)]);
    previousUrl.current = currentUrl;

    if (DASHBOARD_URL_PATTERN.test(window.location.pathname)) {
      return;
    }

    const pageViewTimeout = setTimeout(() => {
      push(['setDocumentTitle', document.title]);
      push(['trackPageView']);
    }, 0);

    return () => clearTimeout(pageViewTimeout);
  }, [pathname]);

  return null;
}
