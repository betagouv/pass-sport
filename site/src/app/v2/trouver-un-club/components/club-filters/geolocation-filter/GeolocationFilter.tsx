'use client';

import Range from '@codegouvfr/react-dsfr/Range';
import styles from './styles.module.scss';
import cn from 'classnames';
import { useContext, useEffect, useState } from 'react';
import { GeolocationContext } from '@/store/geolocationContext';
import { useSearchParams } from 'next/navigation';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DEFAULT_DISTANCE } from 'utils/map';

interface Props {
  onChanged: (distance: string) => void;
}

const GeolocalisationFilter: React.FC<Props> = ({ onChanged }) => {
  const { loading, error } = useContext(GeolocationContext);

  const searchParam = useSearchParams();
  const defaultDistance =
    (searchParam && searchParam.get(SEARCH_QUERY_PARAMS.distance)) || DEFAULT_DISTANCE.toString();

  const [selectedDistance, setSelectedDistance] = useState<string | null>(null);

  useEffect(() => {
    const identifier = setTimeout(() => {
      if (selectedDistance) {
        onChanged(selectedDistance);
        setSelectedDistance(null);
      }
    }, 300);

    return () => clearTimeout(identifier);
  }, [selectedDistance, onChanged]);

  const isVisible: boolean = !(loading || !!error);

  return (
    <>
      {isVisible && (
        <Range
          hintText="Dans un rayon autour de"
          label="Autour de moi"
          max={200}
          min={10}
          suffix=" km"
          step={10}
          nativeInputProps={{
            defaultValue: defaultDistance,
            onChange: (e: React.FormEvent<HTMLInputElement>) => {
              setSelectedDistance(e.currentTarget.value);
            },
          }}
          className={cn('fr-py-2w', styles.width)}
        />
      )}
    </>
  );
};

export default GeolocalisationFilter;
