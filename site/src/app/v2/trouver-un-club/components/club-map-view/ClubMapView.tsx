import { ClubsOnMapProvider } from 'types/Club';
import { useContext, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GeolocationContext } from '@/store/geolocationContext';
import { useSearchParams } from 'next/navigation';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DEFAULT_DISTANCE } from 'utils/map';
import { LatLngLiteral } from 'leaflet';
import { getCenter } from 'geolib';
import styles from './styles.module.scss';

interface Props {
  clubsProvider: ClubsOnMapProvider;
}

const Loading = () => {
  return (
    <div className={styles['loading-box']}>
      <div className="fr-mx-auto">
        <p>Chargement des clubs</p>
      </div>
    </div>
  );
};

const ClubMapView: React.FC<Props> = ({ clubsProvider }) => {
  const isFetching = clubsProvider.isFetchingClubsOnMap;

  const ClubsMap = useMemo(
    () =>
      dynamic(() => import('../clubs-map/ClubsMap'), {
        ssr: false,
        loading: () => <Loading />,
      }),
    [],
  );

  const searchParams = useSearchParams();

  const { longitude, latitude } = useContext(GeolocationContext);

  const getDistance = (): number => {
    const distanceParams = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.distance);

    if (!distanceParams || isNaN(Number(distanceParams))) {
      return DEFAULT_DISTANCE * 1000;
    }

    return parseInt(distanceParams) * 1000;
  };

  const buildMapCenterPosition = (): LatLngLiteral | undefined => {
    const centerLat = searchParams?.get(SEARCH_QUERY_PARAMS.centerLat);
    const centerLng = searchParams?.get(SEARCH_QUERY_PARAMS.centerLng);

    if (centerLat && centerLng && !isNaN(Number(centerLat)) && !isNaN(Number(centerLng))) {
      return { lat: Number(centerLat), lng: Number(centerLng) };
    }

    if (longitude && latitude) {
      return { lat: latitude, lng: longitude };
    }

    // When gelocation is not authorized
    const centerFromClubs = getCenter(
      clubsProvider.results
        .filter((club) => club.geoloc_finale)
        .map((club) => ({ latitude: club.geoloc_finale!.lat, longitude: club.geoloc_finale!.lon })),
    );

    if (!centerFromClubs) {
      return { lat: 48.864716, lng: 2.349014 }; // Paris
    }

    return { lat: centerFromClubs.latitude, lng: centerFromClubs.longitude };
  };

  const buildUserPosition = (): LatLngLiteral | undefined => {
    if (longitude && latitude) {
      return { lat: latitude, lng: longitude };
    }
  };

  const buildZoomValue = (): number => {
    const zoom = searchParams?.get(SEARCH_QUERY_PARAMS.zoom);

    if (zoom && !isNaN(Number(zoom))) {
      return Number(zoom);
    }

    if (longitude && latitude) {
      return 7;
    }

    return 3;
  };

  return (
    <div className={styles.main}>
      {isFetching ? (
        <Loading />
      ) : (
        <ClubsMap
          clubs={clubsProvider.results}
          centerPosition={buildMapCenterPosition()}
          userPosition={buildUserPosition()}
          distance={getDistance()}
          zoom={buildZoomValue()}
        />
      )}
    </div>
  );
};

export default ClubMapView;
