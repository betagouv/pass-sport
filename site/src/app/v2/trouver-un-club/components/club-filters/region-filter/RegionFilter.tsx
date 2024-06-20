'use client';

import cn from 'classnames';
import { useSearchParams } from 'next/navigation';
import Select, { SingleValue } from 'react-select';
import { GeoGouvRegion } from '../../../../../../../types/Region';
import { selectStyles, Option } from '../ClubFilters';
import styles from '../styles.module.scss';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';

interface Props {
  regions: GeoGouvRegion[];
  onRegionChanged: (region?: string) => void;
}

const RegionFilter: React.FC<Props> = ({ regions, onRegionChanged }) => {
  const searchParam = useSearchParams();
  const regionCodeSearchParam = searchParam && searchParam.get(SEARCH_QUERY_PARAMS.regionCode);

  const parsedRegions: Option[] = regions.map((region) => ({
    label: region.nom,
    value: region.code,
  }));

  const defaultRegionOption: Option | undefined = parsedRegions.find(
    (r) => r.value === regionCodeSearchParam,
  );

  const regionChangeHandler = (newValue: SingleValue<Option>) => {
    if (!newValue) {
      onRegionChanged();
    } else {
      onRegionChanged(newValue.value);
    }
  };

  return (
    <div className={styles['label-container']}>
      <label htmlFor="region" className={styles.label}>
        Choix d&apos;une région
      </label>
      <div className={styles['input-container']}>
        <span className={cn('fr-icon-map-pin-2-fill', styles.icon)} aria-hidden="true"></span>
        <Select
          defaultValue={defaultRegionOption}
          instanceId="region-select-id"
          className={styles.select}
          isClearable
          placeholder="Toutes les régions"
          isSearchable
          name="region"
          options={parsedRegions}
          onChange={regionChangeHandler}
          styles={selectStyles}
        />
      </div>
    </div>
  );
};

export default RegionFilter;
