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

  const [selectedDistance, setSelectedDistance] = useState<string>(defaultDistance);

  const buildHintTextWhenDisabled = (): string => {
    if (loading || error) {
      return 'Veuillez authoriser la geolocalisation pour utiliser ce filtre';
    }
    return '';
  };

  useEffect(() => {
    const identifier = setTimeout(() => {
      onChanged(selectedDistance);
    }, 300);

    return () => clearTimeout(identifier);
  }, [selectedDistance]);

  const isDisabled: boolean = loading || !!error;
  return (
    <Range
      disabled={isDisabled}
      hintText={isDisabled ? buildHintTextWhenDisabled() : 'Dans un rayon autour de'}
      label="Autour de moi"
      max={200}
      min={0}
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
  );
};

export default GeolocalisationFilter;
