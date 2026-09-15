'use client';

import { usePathname } from 'next/navigation';
import TrackEventOnMount from '@/app/components/track-event-on-mount/TrackEventOnMount';
import { MATOMO_CATEGORY } from '@/utils/matomo-category';

export default function NotFoundTracker() {
  const pathname = usePathname();

  return (
    <TrackEventOnMount category={MATOMO_CATEGORY.error} action="page introuvable" name={pathname} />
  );
}
