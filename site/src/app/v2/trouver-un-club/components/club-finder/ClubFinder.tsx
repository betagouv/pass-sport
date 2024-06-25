'use client';

import styles from './style.module.scss';
import { useContext, useEffect, useState } from 'react';
import { getClubs, getClubsWithoutLimit, SqlSearchParams } from '../../agent';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ClubFilters from '../club-filters/ClubFilters';
import { GeoGouvRegion } from 'types/Region';
import { ActivityResponse, ClubsOnMapProvider, SportGouvJSONRecordsResponse } from 'types/Club';
import cn from 'classnames';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useAppendQueryString } from '@/app/hooks/use-append-query-string';
import { useRemoveQueryString } from '@/app/hooks/use-remove-query-string';
import { GeoGouvDepartment } from '../../../../../../types/Department';
import { escapeSingleQuotes } from '../../../../../../utils/string';
import ClubMapView from '../club-map-view/ClubMapView';
import ClubListView from '../club-list-view/ClubListView';
import MissingClubInformationPanel from '../missing-club-information-panel/MissingClubInformationPanel';
import { SegmentedControl } from '@codegouvfr/react-dsfr/SegmentedControl';
import ClubCount from '../club-count/ClubCount';
import { GeolocationContext } from '@/store/geolocationContext';
import { DEFAULT_DISTANCE } from 'utils/map';

interface Props {
  regions: GeoGouvRegion[];
  activities: ActivityResponse;
  departments: GeoGouvDepartment[];
  isProVersion?: boolean;
}

const ClubFinder = ({ regions, activities, departments, isProVersion }: Props) => {
  const limit = 20;
  const router = useRouter();
  const pathname = usePathname();
  const appendQueryString = useAppendQueryString();
  const removeQueryString = useRemoveQueryString();
  const searchParams = useSearchParams();

  const geolocationContext = useContext(GeolocationContext);

  const [clubsOnList, setClubsOnList] = useState<SportGouvJSONRecordsResponse>({
    results: [],
    total_count: 0,
  });
  const [clubsOnMap, setClubsOnMap] = useState<ClubsOnMapProvider>({
    results: [],
    total_count: 0,
    isFetchingClubsOnMap: true,
  });

  const buildDistanceExpression = (): string | null => {
    const { latitude, longitude } = geolocationContext;

    if (!latitude && !longitude) {
      return null;
    }

    // geolocation is enabled by user
    let distanceParam = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.distance);

    if (!distanceParam) {
      distanceParam = DEFAULT_DISTANCE.toString();
    }
    return `within_distance(geoloc_finale, GEOM'POINT(${longitude} ${latitude} )',${distanceParam}km)`;
  };

  const [clubParams, setClubParams] = useState<SqlSearchParams>({
    limit,
    offset: 0,
    ...(searchParams && {
      [SEARCH_QUERY_PARAMS.clubName]: searchParams.get(SEARCH_QUERY_PARAMS.clubName)
        ? `nom like '%${searchParams.get(SEARCH_QUERY_PARAMS.clubName)!.toUpperCase()}%'`
        : undefined,
      [SEARCH_QUERY_PARAMS.regionCode]: searchParams.get(SEARCH_QUERY_PARAMS.regionCode)
        ? `reg_code='${searchParams.get(SEARCH_QUERY_PARAMS.regionCode)}'`
        : undefined,
      [SEARCH_QUERY_PARAMS.city]: searchParams.get(SEARCH_QUERY_PARAMS.city)
        ? `commune='${searchParams.get(SEARCH_QUERY_PARAMS.city)!.toUpperCase()}'`
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
      [SEARCH_QUERY_PARAMS.departmentCode]: searchParams.get(SEARCH_QUERY_PARAMS.departmentCode)
        ? `dep_code='${searchParams.get(SEARCH_QUERY_PARAMS.departmentCode)}'`
        : undefined,
      [SEARCH_QUERY_PARAMS.distance]: undefined,
    }),
  });

  const getParameterFromQuery = (searchQUeryParam: keyof typeof SEARCH_QUERY_PARAMS) => {
    const param = searchParams && searchParams.get(SEARCH_QUERY_PARAMS[searchQUeryParam]);

    if (searchQUeryParam === 'isShowingMapTab') {
      if (isNaN(Number(param))) {
        return undefined;
      }
      return param;
    }
  };

  const showClubListOnMap = getParameterFromQuery('isShowingMapTab') === '1';

  const { clubName, regionCode, city, postalCode, activity, disability, offset, distance } =
    clubParams;

  useEffect(() => {
    if (offset === 0) {
      getClubs(clubParams).then(setClubsOnList);
    } else {
      getClubs(clubParams).then((res) =>
        setClubsOnList((clubs) => {
          return { results: [...clubs.results, ...res.results], total_count: res.total_count };
        }),
      );
    }
  }, [clubName, regionCode, city, postalCode, activity, disability, offset, clubParams]);

  useEffect(() => {
    if (!geolocationContext.loading && distance !== undefined) {
      setClubsOnMap((provider) => ({ ...provider, isFetchingClubsOnMap: true }));
      getClubsWithoutLimit(clubParams).then((response) =>
        setClubsOnMap({ ...response, isFetchingClubsOnMap: false }),
      );
    }
  }, [
    clubName,
    regionCode,
    city,
    postalCode,
    activity,
    disability,
    offset,
    clubParams,
    distance,
    geolocationContext.loading,
  ]);

  useEffect(() => {
    if (!geolocationContext.loading) {
      setClubParams((previousState) => {
        return {
          ...previousState,
          [SEARCH_QUERY_PARAMS.distance]: buildDistanceExpression(),
        };
      });
    }
  }, [geolocationContext.loading]);

  const seeMoreClubsHandler = () => {
    setClubParams((clubParams) => ({ ...clubParams, offset: clubParams.offset + limit }));
  };

  const searchClubByTextHandler = (text: string) => {
    const params: SqlSearchParams = { ...clubParams, offset: 0, clubName: undefined };
    const escapedText = escapeSingleQuotes(text);

    if (text.length !== 0) {
      params.clubName = `nom like '%${escapedText.toUpperCase()}%'`;
      const queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.clubName, value: escapedText },
      ]);

      router.push(`${pathname}?${queryString}`, { scroll: false });
    } else {
      const queryString = removeQueryString(SEARCH_QUERY_PARAMS.clubName);

      router.push(`${pathname}?${queryString}`, { scroll: false });
    }

    setClubParams(params);
  };

  const onRegionChanged = (region?: string) => {
    const queryParams = [
      { key: SEARCH_QUERY_PARAMS.centerLat, value: '' },
      { key: SEARCH_QUERY_PARAMS.centerLng, value: '' },
      { key: SEARCH_QUERY_PARAMS.zoom, value: '' },
    ];

    if (!region) {
      setClubParams((clubParams) => ({ ...clubParams, offset: 0, regionCode: undefined }));

      queryParams.push({ key: SEARCH_QUERY_PARAMS.regionCode, value: '' });
    } else {
      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        regionCode: `reg_code='${region}'`,
      }));

      queryParams.push({ key: SEARCH_QUERY_PARAMS.regionCode, value: region });
    }

    const queryString = appendQueryString(queryParams);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const onDepartmentChanged = (departmentCode?: string) => {
    const queryParams = [
      { key: SEARCH_QUERY_PARAMS.centerLat, value: '' },
      { key: SEARCH_QUERY_PARAMS.centerLng, value: '' },
      { key: SEARCH_QUERY_PARAMS.zoom, value: '' },
    ];

    if (!departmentCode) {
      queryParams.push({ key: SEARCH_QUERY_PARAMS.departmentCode, value: '' });

      setClubParams((clubParams) => ({ ...clubParams, offset: 0, departmentCode: undefined }));
    } else {
      queryParams.push({ key: SEARCH_QUERY_PARAMS.departmentCode, value: departmentCode });

      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        departmentCode: `dep_code='${departmentCode}'`,
      }));
    }

    const queryString = appendQueryString(queryParams);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const onCityChanged = ({ city, postalCode }: { city?: string; postalCode?: string }) => {
    const queryParams = [
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

    if (postalCode) {
      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        postalCode: `cp='${postalCode}'`,
        city: undefined,
      }));
    }

    if (city) {
      const escapedSingleQuotesCity = escapeSingleQuotes(city);

      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        city: `commune='${escapedSingleQuotesCity.toUpperCase()}'`,
        postalCode: undefined,
      }));

      queryParams.push({
        key: SEARCH_QUERY_PARAMS.city,
        value: escapedSingleQuotesCity.toUpperCase(),
      });
      queryParams.push({ key: SEARCH_QUERY_PARAMS.postalCode, value: '' });
    } else {
      queryParams.push({ key: SEARCH_QUERY_PARAMS.city, value: '' });
      queryParams.push({
        key: SEARCH_QUERY_PARAMS.postalCode,
        value: postalCode?.toUpperCase() || '',
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

  const onDistanceChanged = (distance: string) => {
    const { longitude, latitude } = geolocationContext;

    if (latitude && longitude) {
      setClubParams((clubParams) => ({
        ...clubParams,
        offset: 0,
        distance: `within_distance(geoloc_finale, GEOM'POINT(${longitude} ${latitude} )',${distance}km)`,
      }));

      const queryString = appendQueryString([
        { key: SEARCH_QUERY_PARAMS.distance, value: distance },
      ]);
      router.push(`${pathname}?${queryString}`, { scroll: false });
    }
  };

  const showClubsOnListTabHandler = () => {
    const queryString = appendQueryString([
      { key: SEARCH_QUERY_PARAMS.isShowingMapTab, value: '0' },
    ]);

    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  const showClubsOnMapTabHandler = () => {
    const queryString = appendQueryString([
      { key: SEARCH_QUERY_PARAMS.isShowingMapTab, value: '1' },
    ]);
    router.push(`${pathname}?${queryString}`, { scroll: false });
  };

  return (
    <>
      <div className={cn('fr-mb-10w', styles.spacer)}>
        <ClubFilters
          regions={regions}
          activities={activities}
          departments={departments}
          isGeolocationFilterVisible={showClubListOnMap}
          onTextSearch={searchClubByTextHandler}
          onRegionChanged={onRegionChanged}
          onDepartmentChanged={onDepartmentChanged}
          onCityChanged={onCityChanged}
          onActivityChanged={onActivityChanged}
          onDisabilityChanged={onDisabilityChanged}
          onDistanceChanged={onDistanceChanged}
        />

        <div className={styles.center}>
          <SegmentedControl
            hideLegend={true}
            segments={[
              {
                label: 'Liste',
                iconId: 'fr-icon-settings-5-line',
                nativeInputProps: {
                  checked: !showClubListOnMap,
                  onChange: showClubsOnListTabHandler,
                },
              },
              {
                label: 'Carte',
                iconId: 'fr-icon-settings-5-line',
                nativeInputProps: {
                  checked: showClubListOnMap,
                  onChange: showClubsOnMapTabHandler,
                },
              },
            ]}
          />
        </div>

        <div className={cn('fr-mt-9w')}>
          <ClubCount
            displayedClubCount={
              showClubListOnMap ? clubsOnMap.total_count : clubsOnList.results.length
            }
            totalClubCount={clubsOnList.total_count}
            isPaginating={!showClubListOnMap}
          />
        </div>

        <div className="fr-pt-3w">
          {showClubListOnMap ? (
            <ClubMapView clubsProvider={clubsOnMap} />
          ) : (
            <ClubListView clubs={clubsOnList} onSeeMoreClubsClicked={seeMoreClubsHandler} />
          )}
        </div>

        <MissingClubInformationPanel isProVersion={isProVersion} />
      </div>

      {!isProVersion && <EligibilityTestBanner />}
    </>
  );
};

export default ClubFinder;
