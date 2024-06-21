'use client';

import dynamic from 'next/dynamic';
import cn from 'classnames';
import { ActivityResponse } from 'types/Club';
import { GeoGouvRegion } from 'types/Region';
import Search from '../search/Search';
import RegionFilter from './region-filter/RegionFilter';
import styles from './styles.module.scss';
import CityFilter from '@/app/v2/trouver-un-club/components/club-filters/city-filter/CityFilter';
import ActivityFilter from '@/app/v2/trouver-un-club/components/club-filters/activity-filter/ActivityFilter';
import HandicapFilter from '@/app/v2/trouver-un-club/components/club-filters/handicap-filter/HandicapFilter';
import { GeoGouvDepartment } from '../../../../../../types/Department';
import DepartmentFilter from '@/app/v2/trouver-un-club/components/club-filters/department-filter/DepartmentFilter';

export interface Option {
  label: string;
  value: string;
}

interface Props {
  regions: GeoGouvRegion[];
  departments: GeoGouvDepartment[];
  activities: ActivityResponse;
  isGeolocationFilterVisible: boolean;
  onTextSearch: (text: string) => void;
  onRegionChanged: (region?: string) => void;
  onDepartmentChanged: (department?: string) => void;
  onCityChanged: (cityOrPostalCode: { city?: string; postalCode?: string }) => void;
  onActivityChanged: (activity?: string) => void;
  onDisabilityChanged: (isActivated: boolean) => void;
  onDistanceChanged: (distance: string) => void;
}

export const selectStyles = {
  control: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    flexGrow: 1,
    borderColor: '#ffffff',
    width: '210px',
    '@media screen and (max-width: 992px)': {
      width: '150px',
    },
    '@media screen and (max-width: 768px)': {
      width: '100%',
    },
  }),
  indicatorSeparator: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    backgroundColor: '#ffffff',
  }),
  valueContainer: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    paddingLeft: '0px',
  }),
  menu: (baseStyles: Record<string, unknown>) => ({
    ...baseStyles,
    zIndex: 999,
  }),
};

const GeolocationFilter = dynamic(() => import('./geolocation-filter/GeolocationFilter'), {
  ssr: false,
});

const ClubFilters: React.FC<Props> = ({
  regions,
  activities,
  departments,
  isGeolocationFilterVisible,
  onTextSearch,
  onRegionChanged,
  onDepartmentChanged,
  onCityChanged,
  onActivityChanged,
  onDisabilityChanged,
  onDistanceChanged,
}) => {
  return (
    <div className={cn('fr-pt-3w', 'fr-pb-2w', styles.container)}>
      <div className="fr-px-2w">
        <Search onTextSearch={onTextSearch} />

        <p className={cn('fr-text--sm', 'fr-py-2w', 'fr-mb-0', styles.title)}>Filtrer par :</p>
        <div className={styles.firstLinefiltersContainer}>
          <div className={cn(styles.flex)}>
            <RegionFilter regions={regions} onRegionChanged={onRegionChanged} />
          </div>

          <div className={styles.separator} />

          <div className={cn(styles.flex)}>
            <DepartmentFilter departments={departments} onDepartmentChanged={onDepartmentChanged} />
          </div>

          <div className={styles.separator} />

          <div className={cn(styles.flex)}>
            <CityFilter onCityChanged={onCityChanged} />
          </div>

          <div className={styles.separator} />

          <div className={cn(styles.flex)}>
            <ActivityFilter onActivityChanged={onActivityChanged} activities={activities} />
          </div>
        </div>

        <div className={styles.secondLinefilters}>
          <div className="fr-pt-2w">
            <div className={styles.secondLinefilters_separator} />
          </div>
          <div className={styles.secondLinefilters_container}>
            {isGeolocationFilterVisible && <GeolocationFilter onChanged={onDistanceChanged} />}
            <HandicapFilter onDisabilityChanged={onDisabilityChanged} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClubFilters;
