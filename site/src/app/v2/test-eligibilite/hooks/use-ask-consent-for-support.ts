import { useEffect } from 'react';
import { SUPPORT_COOKIE_KEY } from '@/app/constants/cookie-manager';

export function useAskConsentForSupport() {
  // Ask for consent for the cookie related to support once on the page
  useEffect(() => {
    // Timeout is necessary to wait for tarteaucitron modal to be rendered properly
    setTimeout(() => {
      const tac = window.tarteaucitron;

      // "false" or "true" means the user has given or not given consent
      // otherwise it means the user didn't explicitly set any consentment
      const hasYetToGiveConsent = typeof tac?.state?.[SUPPORT_COOKIE_KEY] !== 'boolean';

      if (tac && hasYetToGiveConsent) {
        tac?.userInterface?.openAlert();

        const btn = document.querySelector<HTMLButtonElement>('#tarteaucitronPersonalize2');

        if (btn) {
          // Focus on the first button whenever the alert UI is displayed
          btn.focus();
        }
      }
    }, 2000);
  }, []);
}
