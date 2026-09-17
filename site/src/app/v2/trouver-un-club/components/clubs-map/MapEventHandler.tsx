import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useAppendQueryString } from '@/app/hooks/use-append-query-string';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const MapEventHandler = () => {
  const map = useMap();
  const router = useRouter();
  const pathname = usePathname();

  const appendQueryString = useAppendQueryString();

  const latestNavigation = useRef({ router, pathname, appendQueryString });

  useEffect(() => {
    latestNavigation.current = { router, pathname, appendQueryString };
  }, [router, pathname, appendQueryString]);

  useEffect(() => {
    const onMoveEnd = () => {
      const { router, pathname, appendQueryString } = latestNavigation.current;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.centerLat, value: center.lat.toString() },
        { key: SEARCH_QUERY_PARAMS.centerLng, value: center.lng.toString() },
        { key: SEARCH_QUERY_PARAMS.zoom, value: zoom.toString() },
      ]);

      router.push(`${pathname}?${queryString}`, { scroll: false });
    };

    map.on('moveend', onMoveEnd);

    return () => {
      map.off('moveend', onMoveEnd);
    };
  }, [map]);

  return null;
};

export default MapEventHandler;
