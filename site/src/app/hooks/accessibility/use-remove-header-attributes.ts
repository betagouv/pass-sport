import { MutableRefObject, useEffect } from 'react';

// todo: remove if not used after accessibility audit
// Accessibility workaround to remove certain attributes from header component
export function useRemoveHeaderAttributes(headerRef: MutableRefObject<HTMLElement | null>) {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(({ type, target }) => {
        if (type === 'attributes' && target instanceof Element) {
          target.removeAttribute('aria-labelledby');
        }
      });
    });

    const node = headerRef.current?.querySelector('#header-menu-modal-fr-header');

    if (node) {
      // Remove the attribute initially
      node.removeAttribute('aria-labelledby');

      // Observe because it gets added later on somehow
      // Only filter attribute 'aria-labelledby', the one we are interested in removing
      observer.observe(node, { attributes: true, attributeFilter: ['aria-labelledby'] });
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
