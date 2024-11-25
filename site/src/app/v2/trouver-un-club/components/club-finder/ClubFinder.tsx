'use client';

import styles from './style.module.scss';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getClubs, getClubsWithoutLimit, SqlSearchParams } from '../../agent';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ActivityResponse, ClubsOnList, ClubsOnMap } from 'types/Club';
import cn from 'classnames';
import ClubCount from '../club-count/ClubCount';
import { SEARCH_QUERY_PARAMS, UrlQueryParameters } from '@/app/constants/search-query-params';
import {
  useAppendQueryString,
  UseAppendQueryStringPairs,
} from '@/app/hooks/use-append-query-string';
import { useRemoveQueryString } from '@/app/hooks/use-remove-query-string';
import { escapeSingleQuotes } from '../../../../../../utils/string';
import ClubMapView from '../club-map-view/ClubMapView';
import ClubListView from '../club-list-view/ClubListView';
import MissingClubInformationPanel from '../missing-club-information-panel/MissingClubInformationPanel';
import { SegmentedControl } from '@codegouvfr/react-dsfr/SegmentedControl';
import { GeolocationContext } from '@/store/geolocationContext';
import { LIST_LIMIT, MAP_DEFAULT_DISTANCE } from 'utils/club-finder';
import { push } from '@socialgouv/matomo-next';
import { setFocusOn } from 'utils/dom';
import dynamic from 'next/dynamic';

interface Props {
  activities: ActivityResponse;
  isProVersion?: boolean;
}

const ClubFinder = ({ activities, isProVersion }: Props) => {
  const limit = LIST_LIMIT;
  const router = useRouter();
  const pathname = usePathname();

  const ClubFiltersInAccordion = useMemo(
    () =>
      dynamic(() => import('../club-filters-in-accordion/ClubFiltersInAccordion'), { ssr: false }),
    [],
  );
  const appendQueryString = useAppendQueryString();
  const removeQueryString = useRemoveQueryString();
  const searchParams = useSearchParams();

  const geolocationContext = useContext(GeolocationContext);
  const { latitude, longitude, loading: isGeolocationLoading } = geolocationContext;

  const [clubsOnList, setClubsOnList] = useState<ClubsOnList>({
    results: [],
    total_count: 0,
    firstRecievedClubIndex: 0,
  });

  const [clubsOnMap, setClubsOnMap] = useState<ClubsOnMap>({
    results: [],
    total_count: 0,
    isFetchingClubsOnMap: true,
  });

  const [clubParams, setClubParams] = useState<SqlSearchParams>({
    limit,
    offset: 0,
    ...(searchParams && {
      [SEARCH_QUERY_PARAMS.city]: searchParams.get(SEARCH_QUERY_PARAMS.city)
        ? `com_arm_name LIKE '${searchParams.get(SEARCH_QUERY_PARAMS.city)!.toUpperCase()}%'`
        : undefined,
      [SEARCH_QUERY_PARAMS.postalCode]: searchParams.get(SEARCH_QUERY_PARAMS.postalCode)
        ? `cp='${searchParams.get(SEARCH_QUERY_PARAMS.postalCode)}'`
        : undefined,
      [SEARCH_QUERY_PARAMS.handicap]: searchParams.get(SEARCH_QUERY_PARAMS.handicap)
        ? `handicap='${searchParams.get(SEARCH_QUERY_PARAMS.handicap)}'`
        : undefined,
      [SEARCH_QUERY_PARAMS.activity]: searchParams.get(SEARCH_QUERY_PARAMS.activity)
        ? `activites='${searchParams.get(SEARCH_QUERY_PARAMS.activity)}'`
        : undefined,
      distance: undefined,
    }),
  });

  const [isAroundMeChecked, setIsAroundMeChecked] = useState<boolean | undefined>(undefined);

  const parseParameterFromQuery = (searchQueryParam: UrlQueryParameters) => {
    const param = searchParams && searchParams.get(searchQueryParam);

    if (param === SEARCH_QUERY_PARAMS.isShowingMapTab || param === SEARCH_QUERY_PARAMS.aroundMe) {
      return Number(param) === 1 ? param : undefined;
    }

    return param !== null ? param : undefined;
  };

  const showClubListOnMap = parseParameterFromQuery(SEARCH_QUERY_PARAMS.isShowingMapTab) === '1';
  const isAroundMeCheckedParam = parseParameterFromQuery(SEARCH_QUERY_PARAMS.aroundMe) === '1';
  const cityParam = parseParameterFromQuery(SEARCH_QUERY_PARAMS.city);
  const postalCodeParam = parseParameterFromQuery(SEARCH_QUERY_PARAMS.postalCode);

  const { clubName, city, postalCode, activity, disability, offset, distance } = clubParams;

  useEffect(() => {
    if (distance !== undefined) {
      const clubParams = {
        limit,
        offset,
        clubName,
        city,
        postalCode,
        disability,
        activity,
        distance,
      };
      if (offset === 0) {
        getClubs(clubParams).then((clubs) =>
          setClubsOnList({ ...clubs, firstRecievedClubIndex: 0 }),
        );
      } else {
        getClubs(clubParams).then((res) =>
          setClubsOnList((clubs) => {
            return {
              results: [...clubs.results, ...res.results],
              total_count: res.total_count,
              firstRecievedClubIndex: offset + 1,
            };
          }),
        );
      }
    }
  }, [clubName, city, postalCode, activity, disability, offset, limit, distance]);

  useEffect(() => {
    if (!isGeolocationLoading && distance !== undefined) {
      setClubsOnMap((provider) => ({ ...provider, isFetchingClubsOnMap: true }));
      getClubsWithoutLimit({
        clubName,
        city,
        postalCode,
        activity,
        disability,
        distance,
        offset,
      }).then((response) => setClubsOnMap({ ...response, isFetchingClubsOnMap: false }));
    }
  }, [offset, clubName, city, postalCode, activity, disability, distance, isGeolocationLoading]);

  const buildDistanceExpression = useCallback((): string | null | undefined => {
    const distance = MAP_DEFAULT_DISTANCE.toString();

    if (!latitude && !longitude) {
      return null;
    }

    if (isAroundMeChecked === undefined) {
      return undefined;
    }

    if (!isAroundMeChecked) {
      return null;
    }

    return `within_distance(geoloc_finale, GEOM'POINT(${longitude} ${latitude} )',${distance}km)`;
  }, [latitude, longitude, isAroundMeChecked]);

  useEffect(() => {
    if (!isGeolocationLoading) {
      setClubParams((previousState) => {
        return {
          ...previousState,
          distance: buildDistanceExpression(),
        };
      });
    }
  }, [isGeolocationLoading, buildDistanceExpression]);

  useEffect(() => {
    if (!latitude) {
      setIsAroundMeChecked(false);
    } else {
      setIsAroundMeChecked(isAroundMeCheckedParam);
    }
  }, [latitude, isAroundMeCheckedParam]);

  useEffect(() => {
    setFocusOn(`#club-list > li:nth-child(${clubsOnList.firstRecievedClubIndex}) a`);
  }, [clubsOnList.firstRecievedClubIndex]);

  useEffect(() => {
    if ((cityParam && !postalCodeParam) || (!cityParam && postalCodeParam)) {
      const queryString = removeQueryString(
        cityParam ? SEARCH_QUERY_PARAMS.city : SEARCH_QUERY_PARAMS.postalCode,
      );

      setClubParams((prevState) => {
        return { ...prevState, city: undefined, postalCode: undefined };
      });
      router.push(`${pathname}?${queryString}`, { scroll: false });
    }
  }, [cityParam, postalCodeParam, router, pathname, removeQueryString]);

  const seeMoreClubsHandler = () => {
    setClubParams((clubParams) => ({ ...clubParams, offset: clubParams.offset + limit }));
  };

  const onCityChanged = ({ city, postalCode }: { city?: string; postalCode?: string }) => {
    const queryParams: UseAppendQueryStringPairs = [
      { key: SEARCH_QUERY_PARAMS.centerLat, value: '' },
      { key: SEARCH_QUERY_PARAMS.centerLng, value: '' },
      { key: SEARCH_QUERY_PARAMS.zoom, value: '' },
    ];

    if (!city && !postalCode) {
      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        city: undefined,
        postalCode: undefined,
      }));
    }

    if (postalCode && city) {
      const escapedSingleQuotesCity = escapeSingleQuotes(city);

      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        postalCode: `cp='${postalCode}'`,
        // We add a wildcard at the end because the dataset isn't clean
        // For instance for PARIS (75002), we should have PARIS but we somtimes have PARIS 2 or PARIS 2E etc.
        city: `com_arm_name LIKE '${escapedSingleQuotesCity.toUpperCase()}%'`,
      }));

      queryParams.push({
        key: SEARCH_QUERY_PARAMS.city,
        value: escapedSingleQuotesCity.toUpperCase(),
      });

      queryParams.push({ key: SEARCH_QUERY_PARAMS.postalCode, value: postalCode });
    } else {
      queryParams.push({ key: SEARCH_QUERY_PARAMS.city, value: '' });
      queryParams.push({
        key: SEARCH_QUERY_PARAMS.postalCode,
        value: '',
      });
    }

    const queryString = appendQueryString(queryParams);

    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const onActivityChanged = (activity?: string) => {
    if (!activity) {
      setClubParams((clubParams) => ({ ...clubParams, offset: 0, activity: undefined }));

      const queryString = removeQueryString(SEARCH_QUERY_PARAMS.activity);
      router.push(`${pathname}?${queryString}`, { scroll: false });
    } else {
      const escapedSingleQuotesActivity = escapeSingleQuotes(activity);

      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        activity: `activites='${escapedSingleQuotesActivity}'`,
      }));

      const queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.activity, value: escapedSingleQuotesActivity },
      ]);

      router.push(`${pathname}?${queryString}`, { scroll: false });
    }
  };

  const onDisabilityChanged = (isActivated: boolean) => {
    setClubParams((clubParams) => ({
      ...clubParams,
      offset: 0,
      ...(isActivated ? { disability: `handicap='Oui'` } : { disability: undefined }),
    }));

    let queryString = isActivated
      ? appendQueryString([{ key: SEARCH_QUERY_PARAMS.handicap, value: 'Oui' }])
      : removeQueryString(SEARCH_QUERY_PARAMS.handicap);

    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const onAroundMeActiveStateChanged = (isAroundMeChecked: boolean) => {
    let queryString: String;
    if (isAroundMeChecked) {
      setClubParams((previousState) => ({
        ...previousState,
        city: undefined,
        postalCode: undefined,
        distance: undefined,
      }));

      queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.city, value: '' },
        { key: SEARCH_QUERY_PARAMS.postalCode, value: '' },
        { key: SEARCH_QUERY_PARAMS.aroundMe, value: '1' },
      ]);
    } else {
      setClubParams((previousState) => ({
        ...previousState,
        distance: undefined,
      }));
      queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.centerLat, value: '' },
        { key: SEARCH_QUERY_PARAMS.centerLng, value: '' },
        { key: SEARCH_QUERY_PARAMS.zoom, value: '' },
        { key: SEARCH_QUERY_PARAMS.aroundMe, value: '0' },
      ]);
    }
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const showClubsOnListTabHandler = () => {
    const queryString = appendQueryString([
      { key: SEARCH_QUERY_PARAMS.isShowingMapTab, value: '0' },
    ]);

    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const showClubsOnMapTabHandler = () => {
    let removableQueryStrings: UseAppendQueryStringPairs = [
      { key: SEARCH_QUERY_PARAMS.isShowingMapTab, value: '1' },
    ];

    push(['trackEvent', 'Carte Button', 'Clicked', 'Find a club page']);

    if (latitude && isAroundMeChecked) {
      removableQueryStrings.push({ key: SEARCH_QUERY_PARAMS.city, value: '' });

      setClubParams((prevState) => ({
        ...prevState,
        city: undefined,
      }));
    }

    const queryString = appendQueryString(removableQueryStrings);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  return (
    <div className={cn('fr-mx-2w', 'fr-pt-3v')}>
      {isProVersion && (
        <div className="fr-my-4w">
          <MissingClubInformationPanel isProVersion={true} />
        </div>
      )}

      <div className={styles.sizer}>
        <div
          className={cn(
            'fr-mt-2w',
            'fr-mb-3w',
            'fr-px.md-2w',
            styles['count-and-viewer-container'],
          )}
        >
          <ClubCount totalClubCount={clubsOnList.total_count} />

          <SegmentedControl
            hideLegend={true}
            legend="Choisissez entre la vue liste et la vue cartographie pour voir les clubs"
            segments={[
              {
                label: 'Vue liste',
                iconId: 'fr-icon-list-unordered',
                nativeInputProps: {
                  checked: !showClubListOnMap,
                  onChange: showClubsOnListTabHandler,
                },
              },
              {
                label: 'Vue carte',
                iconId: 'fr-icon-road-map-line',
                nativeInputProps: {
                  checked: showClubListOnMap,
                  onChange: showClubsOnMapTabHandler,
                },
              },
            ]}
            className={styles['segmented-control-custom']}
          />
        </div>

        <div className={styles['club-and-filter-container']}>
          <div>
            <ClubFiltersInAccordion
              activities={activities}
              isAroundMeChecked={isAroundMeChecked || false}
              isAroundMeDisabled={!latitude}
              onCityChanged={onCityChanged}
              onActivityChanged={onActivityChanged}
              onDisabilityChanged={onDisabilityChanged}
              onAroundMeActiveStateChanged={onAroundMeActiveStateChanged}
            />
          </div>

          <div className="fr-pl-md-2w">
            {showClubListOnMap ? (
              <ClubMapView
                clubsProvider={clubsOnMap}
                isGeolocationCircleVisible={isAroundMeChecked || false}
                isSearchingAroundMe={isAroundMeChecked || false}
              />
            ) : (
              <ClubListView clubs={clubsOnList} onSeeMoreClubsClicked={seeMoreClubsHandler} />
            )}
          </div>
        </div>
      </div>
      {!isProVersion && (
        <div className="fr-my-9w">
          <MissingClubInformationPanel isProVersion={false} />
        </div>
      )}
    </div>
  );
};

export default ClubFinder;
