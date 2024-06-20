'use client';

import Range from '@codegouvfr/react-dsfr/Range';
import styles from './styles.module.scss';
import cn from 'classnames';
import { useContext } from 'react';
import { GeolocationContext } from '@/store/geolocationContext';
import { useSearchParams } from 'next/navigation';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';

interface Props {
  onChanged: (distance: string) => void;
}

const GeolocalisationFilter: React.FC<Props> = ({ onChanged }) => {
  const { loading, error } = useContext(GeolocationContext);

  const searchParam = useSearchParams();
  const defaultDistance = (searchParam && searchParam.get(SEARCH_QUERY_PARAMS.distance)) || '50';

  const buildHintTextWhenDisabled = (): string => {
    if (loading || error) {
      return 'Veuillez authoriser la geolocalisation pour utiliser ce filtre';
    }
    return '';
  };

  const isDisabled: boolean = loading || !!error;
  return (
    <Range
      disabled={isDisabled}
      hintText={isDisabled ? buildHintTextWhenDisabled() : 'Dans un rayon autour de'}
      label="Autour de moi"
      max={200}
      min={0}
      suffix=" km"
      // step={10}  // bug
      nativeInputProps={{
        defaultValue: defaultDistance,
        onChange: (e: React.FormEvent<HTMLInputElement>) => {
          onChanged(e.currentTarget.value);
        },
      }}
      className={cn('fr-py-2w', styles.width)}
    />
  );

  // return (
  //   <div className="fr-range-group" id="range-2246-group">
  //     <label className="fr-label">
  //       Autour de moi
  //       <span className="fr-hint-text">Dans un rayon autour de</span>
  //     </label>
  //     <div className="fr-range">
  //       <span className="fr-range__output">50</span>
  //       <input
  //          id="range-2245"
  //          name="range-2245"
  //          type="range"
  //          aria-labelledby="range-2245-label"
  //          min="10"
  //          max="200"
  //          value="50"
  //          aria-describedby="range-2245-messages"
  //        />
  //       <span className="fr-range__min" aria-hidden="true">
  //         10 km
  //       </span>
  //       <span className="fr-range__max" aria-hidden="true">
  //         200 km
  //       </span>
  //     </div>
  //   </div>
  // );
};

export default GeolocalisationFilter;
