import { ClubsOnMap, ExportedClub } from 'types/Club';
import { useContext, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GeolocationContext } from '@/store/geolocationContext';
import { useSearchParams } from 'next/navigation';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { MAP_DEFAULT_DISTANCE, MAP_LIMIT } from 'utils/club-finder';
import { LatLngLiteral } from 'leaflet';
import { getCenter } from 'geolib';
import styles from './styles.module.scss';
import cn from 'classnames';

interface Props {
  clubsProvider: ClubsOnMap;
  isGeolocationCircleVisible: boolean;
  isSearchingAroundMe: boolean;
}

const Loading = () => (
  <div className={styles['loading-box']}>
    <div className="fr-mx-auto">
      <p>Chargement des clubs</p>
    </div>
  </div>
);

const TooManyClubsMessage = () => (
  <p
    role="status"
    aria-live="polite"
    aria-atomic={true}
    className={cn('fr-text--lead', 'fr-py-1w', styles['too-many-club'])}
  >
    <span>Il y a trop de clubs correspondant à votre recherche.</span> Merci de l&apos;affiner pour
    les voir apparaitre sur la carte
  </p>
);

const ZOOM_LEVEL = { COUNTRY: 5, CITY: 7 };

const ClubMapView: React.FC<Props> = ({
  clubsProvider,
  isGeolocationCircleVisible,
  isSearchingAroundMe,
}) => {
  const isFetching = clubsProvider.isFetchingClubsOnMap;
  const areThereTooManyClubs = clubsProvider.total_count === MAP_LIMIT;

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
    return MAP_DEFAULT_DISTANCE * 1000;
  };

  const buildMapCenterPosition = (): LatLngLiteral | undefined => {
    const centerLat = searchParams?.get(SEARCH_QUERY_PARAMS.centerLat);
    const centerLng = searchParams?.get(SEARCH_QUERY_PARAMS.centerLng);

    if (centerLat && centerLng && !isNaN(Number(centerLat)) && !isNaN(Number(centerLng))) {
      return { lat: Number(centerLat), lng: Number(centerLng) };
    }

    if (longitude && latitude && isSearchingAroundMe) {
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
    if (!isGeolocationCircleVisible) {
      return undefined;
    }

    if (areThereTooManyClubs) {
      return undefined;
    }

    if (longitude && latitude) {
      return { lat: latitude, lng: longitude };
    }
  };

  const buildZoomValue = (): number => {
    const zoom = searchParams?.get(SEARCH_QUERY_PARAMS.zoom);

    if (zoom && !isNaN(Number(zoom))) {
      return Number(zoom);
    }

    if (areThereTooManyClubs) {
      return ZOOM_LEVEL.COUNTRY;
    }
    if (longitude && latitude) {
      return ZOOM_LEVEL.CITY;
    }

    return ZOOM_LEVEL.COUNTRY;
  };

  const buildClubs = (): ExportedClub[] => {
    if (areThereTooManyClubs) {
      return [];
    }

    return clubsProvider.results;
  };

  return (
    <div className={styles.main}>
      {isFetching ? (
        <Loading />
      ) : (
        <>
          {areThereTooManyClubs && <TooManyClubsMessage />}
          <ClubsMap
            clubs={buildClubs()}
            centerPosition={buildMapCenterPosition()}
            userPosition={buildUserPosition()}
            distance={getDistance()}
            zoom={buildZoomValue()}
          />
        </>
      )}
    </div>
  );
};

export default ClubMapView;
