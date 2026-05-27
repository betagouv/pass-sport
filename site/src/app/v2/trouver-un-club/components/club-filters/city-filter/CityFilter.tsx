'use client';

import {
  getFranceCitiesByName,
  getFranceCitiesByPostalCodeAndCityName,
} from '@/app/v2/trouver-un-club/agent';
import { Props as ReactSelectProps } from 'react-select';
import { CityOption } from '@/app/v2/trouver-un-club/components/club-filters/ClubFilters';
import { City } from '../../../../../../../types/City';
import React, { useEffect, useState } from 'react';
import { SEARCH_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { useSearchParams } from 'next/navigation';
import styles from '../styles.module.scss';
import AsyncSelect from 'react-select/async';
import { unescapeSingleQuotes } from '@/utils/string';
import {
  createCustomInput,
  CustomPlaceholder,
  customScreenReaderStatus,
  guidance,
  onChange,
  onFilter,
  onFocus,
  selectStyles,
} from '../custom-select/CustomSelect';
import localStyles from './styles.module.scss';
import cn from 'classnames';
import Button from '@codegouvfr/react-dsfr/Button';

interface Props {
  isDisabled: boolean;
  onCityChanged: (cityOrPostalCode: { city?: string; postalCode?: string }) => void;
}

const CustomInput = createCustomInput('Toutes');

const allCitiesOption: CityOption = {
  label: 'Toutes',
  value: null,
};

const CityFilter = ({ isDisabled, onCityChanged }: Props) => {
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState('');

  const city = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.city);
  const postalCode = searchParams && searchParams.get(SEARCH_QUERY_PARAMS.postalCode);

  const [value, setValue] = useState<CityOption>(allCitiesOption);

  const onInputChange: ReactSelectProps['onInputChange'] = (inputValue, { action }) => {
    if (action === 'input-change') {
      setInputValue(inputValue);
    }
  };

  const cityChangeHandler: ReactSelectProps<CityOption, false>['onChange'] = (newValue) => {
    if (!newValue) {
      setInputValue('');
      onCityChanged({});
      /* would happen if field was cleared, but this feature is disabled, so it nerver happens */
      return;
    } else {
      const cityOrPostalCode = newValue.value;

      if (cityOrPostalCode === null) {
        onCityChanged({});
        setValue(allCitiesOption);
        setInputValue('');

        return;
      }

      if (newValue.value?.cityName && newValue.value.postalCode) {
        onCityChanged({ city: newValue.value?.cityName, postalCode: newValue.value?.postalCode });
      }

      setValue({ value: newValue.value, label: newValue.label });
      setInputValue(newValue.label);
    }
  };

  useEffect(() => {
    if (postalCode && city) {
      const unescapedCity = unescapeSingleQuotes(city);

      getFranceCitiesByPostalCodeAndCityName(postalCode, unescapedCity, false).then((cities) => {
        const formattedCities = parseCities(cities);
        let matchingCity = formattedCities.find((formattedCity) => {
          return (
            city === formattedCity.value?.cityName.toUpperCase() &&
            postalCode === formattedCity.value?.postalCode
          );
        });

        if (matchingCity !== undefined) {
          setValue(matchingCity);
          setInputValue(matchingCity.label);
        }
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(allCitiesOption);
      setInputValue('');
    }
  }, [city, postalCode]);

  return (
    <div className={styles['label-container']}>
      <label id="city-label" className={styles.label}>
        Ville
      </label>
      <div className={cn({ [`${localStyles['disabled-cursor']}`]: isDisabled })}>
        <AsyncSelect<CityOption, false>
          isDisabled={isDisabled}
          instanceId="city-select-id"
          key="city-select-with-search-param"
          loadingMessage={() => <p>Chargement des villes</p>}
          noOptionsMessage={() => <p>Aucune ville trouvée</p>}
          cacheOptions
          defaultOptions={[allCitiesOption]}
          loadOptions={fetchCityOptions}
          onChange={cityChangeHandler}
          onInputChange={onInputChange}
          styles={selectStyles}
          value={value}
          inputValue={inputValue}
          ariaLiveMessages={{ guidance, onChange, onFilter, onFocus }}
          aria-labelledby="city-label"
          screenReaderStatus={customScreenReaderStatus}
          getOptionValue={(option) => {
            // Unique identifier for the pre-selected value to be displayed correctly
            // because we are using object as value since by default,
            // react-select checks for reference equality, so to fix that we are giving a unique string for each option
            return `${option.value?.cityName}|${option.value?.postalCode}`;
          }}
          components={{
            Input: CustomInput,
            Placeholder: CustomPlaceholder,
          }}
          // To control the placeholder (we do not want the placeholder to appear in a div, but in the input instead
          controlShouldRenderValue={false}
        />
      </div>

      <Button
        className="fr-col--bottom"
        priority="tertiary no outline"
        onClick={() => {
          setInputValue('');
          setValue(allCitiesOption);
          onCityChanged({});
        }}
      >
        Effacer la ville
      </Button>
    </div>
  );
};

function parseCities(cities: City[]): CityOption[] {
  const citiesWithPostalCode: CityOption[] = [];

  cities.forEach((city) => {
    city.codesPostaux.forEach((postalCode) => {
      citiesWithPostalCode.push({
        label: `${city.nom} (${postalCode})`,
        value: {
          postalCode: postalCode,
          cityName: city.nom,
        },
      });
    });
  });

  return citiesWithPostalCode;
}

function fetchCityOptions(inputValue: string) {
  return getFranceCitiesByName(inputValue, false).then((cities) => parseCities(cities));
}

export default CityFilter;
