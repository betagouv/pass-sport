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
  onCityChanged: (cityOrPostalCode: { city?: string; postalCode?: string }) => void;
}

const CityFilter = ({ onCityChanged }: Props) => {
  const searchParams = useSearchParams();

  const citySearchParams = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.city);
  const postalCodeSearchParams = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.postalCode);
  const [value, setValue] = useState<Option | null>(null);

  const cityChangeHandler = (newValue: SingleValue<Option>) => {
    if (!newValue) {
      /* field was cleared */
      onCityChanged({});
      setValue(null);
    } else {
      const cityOrPostalCode = newValue.value;

      if (cityOrPostalCode === '') {
        onCityChanged({});
        setValue(null);
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
    const city = (searchParams && searchParams.get(SEARCH_QUERY_PARAMS.city)) || '';
    const postalCode = (searchParams && searchParams.get(SEARCH_QUERY_PARAMS.postalCode)) || '';

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
    }
    if (city) {
      const unescapedCity = unescapeSingleQuotes(city);

      getFranceCitiesByName(unescapedCity, false).then((cities) => {
        parseCities(cities);
        setValue(parseCities(cities)[0]);
      });
    }
  }, [citySearchParams, postalCodeSearchParams, searchParams]);

  return (
    <div className={styles['label-container']}>
      <label htmlFor="city" className={styles.label}>
        Ville
      </label>
      <AsyncSelect
        instanceId="city-select-id"
        name="city"
        key="city-select-with-search-param"
        loadingMessage={() => <p>Chargement des villes</p>}
        noOptionsMessage={() => <p>Aucune ville trouvée</p>}
        placeholder="Toutes les villes"
        cacheOptions
        isClearable
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
