'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/utils/matomo';
import type { MatomoCategory } from '@/utils/matomo-category';

type Props = {
  category: MatomoCategory;
  action: string;
  name?: string;
  value?: number;
};

export default function TrackEventOnMount({ category, action, name, value }: Props) {
  useEffect(() => {
    trackEvent(category, action, name, value);
  }, [category, action, name, value]);

  return null;
}
