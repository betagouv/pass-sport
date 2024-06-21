import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useAppendQueryString } from '@/app/hooks/use-append-query-string';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMap } from 'react-leaflet';

const MapEventHandler = () => {
  const map = useMap();
  const router = useRouter();
  const pathname = usePathname();

  const appendQueryString = useAppendQueryString();

  map.on('moveend', (e) => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const queryString = appendQueryString([
      { key: SEARCH_QUERY_PARAMS.centerLat, value: center.lat.toString() },
      { key: SEARCH_QUERY_PARAMS.centerLng, value: center.lng.toString() },
      { key: SEARCH_QUERY_PARAMS.zoom, value: zoom.toString() },
    ]);

    router.push(`${pathname}?${queryString}`, { scroll: false });
  });

  return null;
};

export default MapEventHandler;
