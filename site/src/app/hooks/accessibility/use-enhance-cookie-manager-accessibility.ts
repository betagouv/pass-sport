import { useEffect } from 'react';

// todo: To refactor if time permits
export function useEnhanceCookieManagerAccessibility() {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      const { body } = document;

      const img = body.querySelector('img[title="Cookies (fenêtre modale)"]');
      const button = body.querySelector('button[id="tarteaucitronManager"]');
      const backButton = body.querySelector('button[id="tarteaucitronBack"]');
      const info = body.querySelector('div[id="tarteaucitronInfo"]');
      const othersSection = body.querySelector(
        'li[id="tarteaucitronServicesTitle_other"] > div[class="tarteaucitronTitle"]',
      );

      const duplicatedPanelCookie = body.querySelector('div#tac_title.tac_visually-hidden');
      const duplicatedDialog = body.querySelector('div.tarteaucitronAlertBigTop[role="dialog"]');
      const crispButtonInfo = body.querySelector('button[data-cat="tarteaucitronDetailssupport"]');
      const vimeoButtonInfo = body.querySelector('button[data-cat="tarteaucitronDetailsvideo"]');

      if (img) {
        img.removeAttribute('title');
      }

      if (button) {
        button.removeAttribute('aria-label');
        button.removeAttribute('title');
      }

      if (backButton) {
        backButton.removeAttribute('title');
        backButton.setAttribute('aria-label', 'Fermer la modale');
      }

      if (info) {
        const newNode = document.createElement('p');
        newNode.setAttribute('id', 'tarteaucitronInfo');
        newNode.textContent = info.textContent;

        info.replaceWith(newNode);
      }

      if (othersSection) {
        othersSection.classList.add('tarteaucitronHidden');
      }

      if (duplicatedPanelCookie) {
        duplicatedPanelCookie.remove();
      }

      // https://www.notion.so/Audit-avec-tickets-notion-526ecd6d84764c0c84844c2e41071fe2?p=0ffd86210f7a808699cedc8ef0a8b4e9&pm=s
      if (duplicatedDialog) {
        duplicatedDialog.remove();
      }

      // https://www.notion.so/Audit-avec-tickets-notion-526ecd6d84764c0c84844c2e41071fe2?p=fede5d6d662849379b84f6ef0ab4111f&pm=s
      if (crispButtonInfo) {
        crispButtonInfo.parentElement?.remove();

        const contentDetails = body.querySelector('div#tarteaucitronDetailssupport');

        // Content details need to be placed right after the sibling
        const sibling = body.querySelector(
          'li#tarteaucitronServicesTitle_support .tarteaucitronName span[aria-level="3"]',
        );

        if (contentDetails && sibling) {
          contentDetails.removeAttribute('class');
          contentDetails.setAttribute('role', 'heading');
          contentDetails.setAttribute('aria-level', '4');
          sibling.insertAdjacentElement('afterend', contentDetails);
        }
      }

      // https://www.notion.so/Audit-avec-tickets-notion-526ecd6d84764c0c84844c2e41071fe2?p=fede5d6d662849379b84f6ef0ab4111f&pm=s
      if (vimeoButtonInfo) {
        vimeoButtonInfo.parentElement?.remove();

        const contentDetails = body.querySelector('div#tarteaucitronDetailsvideo');

        // Content details need to be placed right after the sibling
        const sibling = body.querySelector(
          'li#tarteaucitronServicesTitle_video .tarteaucitronName span[aria-level="3"]',
        );

        if (contentDetails && sibling) {
          contentDetails.removeAttribute('class');
          contentDetails.setAttribute('role', 'heading');
          contentDetails.setAttribute('aria-level', '4');
          sibling.insertAdjacentElement('afterend', contentDetails);
        }
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
