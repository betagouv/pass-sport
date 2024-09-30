import { useEffect } from 'react';

// todo: To refactor if time permits
export function useEnhanceCookieManagerAccessibility() {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      const { body } = document;

      const tacRoot = body.querySelector<HTMLDivElement>('#tarteaucitronRoot');
      const alertDialog = body.querySelector<HTMLDivElement>('div#tarteaucitronAlertBig');

      const img = body.querySelector<HTMLImageElement>('img[title="Cookies (fenêtre modale)"]');
      const button = body.querySelector<HTMLButtonElement>('button[id="tarteaucitronManager"]');
      const backButton = body.querySelector<HTMLButtonElement>('button[id="tarteaucitronBack"]');
      const info = body.querySelector<HTMLDivElement>('div[id="tarteaucitronInfo"]');
      const othersSection = body.querySelector<HTMLDivElement>(
        'li[id="tarteaucitronServicesTitle_other"] > div[class="tarteaucitronTitle"]',
      );

      const duplicatedPanelCookie = body.querySelector<HTMLDivElement>(
        'div#tac_title.tac_visually-hidden',
      );

      const crispButtonInfo = body.querySelector<HTMLButtonElement>(
        'button[data-cat="tarteaucitronDetailssupport"]',
      );

      const vimeoButtonInfo = body.querySelector<HTMLButtonElement>(
        'button[data-cat="tarteaucitronDetailsvideo"]',
      );

      const saveButton = body.querySelector<HTMLButtonElement>('button#tarteaucitronSaveButton');
      const closeButton = body.querySelector<HTMLButtonElement>('button#tarteaucitronClosePanel');

      if (saveButton) {
        saveButton.classList.remove('tarteaucitronAllow');
        saveButton.classList.add('fr-btn');
      }

      if (closeButton) {
        closeButton.classList.add('fr-btn');
        closeButton.classList.add('fr-btn--secondary');
      }

      if (tacRoot && alertDialog) {
        tacRoot.removeAttribute('aria-labelledby');
        alertDialog.setAttribute('aria-labelledby', tacRoot.id);
      }

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

          const paragraph = document.createElement('p');

          paragraph.setAttribute('id', contentDetails.id);
          paragraph.textContent = contentDetails.textContent;
          sibling.insertAdjacentElement('afterend', paragraph);

          contentDetails.remove();
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

          const paragraph = document.createElement('p');

          paragraph.setAttribute('id', contentDetails.id);
          paragraph.textContent = contentDetails.textContent;
          sibling.insertAdjacentElement('afterend', paragraph);

          contentDetails.remove();
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
