import { MutableRefObject, useEffect } from 'react';

export function useUpdateTitleIframe({
  parentRef,
  title,
  targetSelector = 'iframe',
}: {
  parentRef: MutableRefObject<HTMLDivElement | null>;
  title: string;
  targetSelector?: string;
}) {
  useEffect(() => {
    const updateTitle = (ref: MutableRefObject<HTMLDivElement | null>) => {
      const node = parentRef.current?.querySelector(targetSelector);

      if (node) {
        node.setAttribute('title', title);
      }
    };

    const observer = new MutationObserver((mutations) => {
      updateTitle(parentRef);
    });

    if (parentRef.current) {
      updateTitle(parentRef);
      observer.observe(parentRef.current, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
