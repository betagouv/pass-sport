'use client';

import { getFranceCitiesByName, getFranceCitiesByPostalCode } from '@/app/v2/trouver-un-club/agent';
import { SingleValue } from 'react-select';
import { Option, selectStyles } from '@/app/v2/trouver-un-club/components/club-filters/ClubFilters';
import { City } from '../../../../../../../types/City';
import { useEffect, useState } from 'react';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useSearchParams } from 'next/navigation';
import styles from '../styles.module.scss';
import AsyncSelect from 'react-select/async';
import { unescapeSingleQuotes } from '../../../../../../../utils/string';

interface Props {
  isDisabled: boolean;
  onCityChanged: (cityOrPostalCode: { city?: string; postalCode?: string }) => void;
}

const allCitiesOption: Option = { label: 'Toutes les villes', value: '' };

const CityFilter = ({ isDisabled, onCityChanged }: Props) => {
  const searchParams = useSearchParams();

  const city = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.city);
  const postalCode = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.postalCode);

  const [value, setValue] = useState<Option>(allCitiesOption);

  const cityChangeHandler = (newValue: SingleValue<Option>) => {
    if (!newValue) {
      /* would happen if field was cleared, but this feature is disabled, so it nerver happens */
      return;
    } else {
      const cityOrPostalCode = newValue.value;

      if (cityOrPostalCode === '') {
        onCityChanged({});
        setValue(allCitiesOption);
        return;
      }

      if (isNaN(cityOrPostalCode as unknown as number)) {
        onCityChanged({ city: newValue.value });
      } else {
        onCityChanged({ postalCode: newValue.value });
      }

      setValue({ value: newValue.value, label: newValue.label });
    }
  };

  useEffect(() => {
    if (postalCode) {
      getFranceCitiesByPostalCode(postalCode, false).then((cities) => {
        const formattedCities = parseCities(cities);
        const matchingCityWithPostalCode = formattedCities.find(
          ({ value, label }) => value === postalCode,
        );

        if (matchingCityWithPostalCode !== undefined) {
          setValue(matchingCityWithPostalCode);
        }
      });
    } else if (city) {
      const unescapedCity = unescapeSingleQuotes(city);

      getFranceCitiesByName(unescapedCity, false).then((cities) => {
        parseCities(cities);
        setValue(parseCities(cities)[1]);
      });
    } else {
      setValue(allCitiesOption);
    }
  }, [city, postalCode]);

  return (
    <div className={styles['label-container']}>
      <label htmlFor="city" className={styles.label}>
        Ville
      </label>
      <AsyncSelect
        isDisabled={isDisabled}
        instanceId="city-select-id"
        name="city"
        key="city-select-with-search-param"
        loadingMessage={() => <p>Chargement des villes</p>}
        noOptionsMessage={() => <p>Aucune ville trouvée</p>}
        cacheOptions
        defaultOptions={[allCitiesOption]}
        loadOptions={fetchCityOptions}
        onChange={cityChangeHandler}
        styles={selectStyles}
        value={value}
      />
    </div>
  );
};

function parseCities(cities: City[]): Option[] {
  return cities
    .map((city) => {
      const result: Option[] = [];

      if (city.codesPostaux.length > 1) {
        result.push({ label: city.nom, value: city.nom });
      }

      return result.concat(
        city.codesPostaux.map((cp) => ({
          label: `${city.nom} (${cp})`,
          value: city.codesPostaux.length > 1 ? cp : city.nom,
        })),
      );
    })
    .flat();
}

function fetchCityOptions(inputValue: string) {
  return getFranceCitiesByName(inputValue, false).then((cities) => parseCities(cities));
}

export default CityFilter;
