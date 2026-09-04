import { useEffect, useState } from 'react';
import { useDebounce } from '@uidotdev/usehooks';
import { City } from '@/types/City';
import { getFranceCitiesByName } from '@/app/services/communes-client';

const CITY_SEARCH_DEBOUNCE_MS = 400;

export function useCitySearch(inputValue: string, includeDistricts: boolean) {
  const debouncedInputValue = useDebounce(inputValue, CITY_SEARCH_DEBOUNCE_MS);
  const [searchResult, setSearchResult] = useState<{ inputValue: string; cities: City[] }>({
    inputValue: '',
    cities: [],
  });

  useEffect(() => {
    if (!debouncedInputValue) {
      return;
    }

    let isStale = false;

    getFranceCitiesByName(debouncedInputValue, includeDistricts).then((cities) => {
      if (!isStale) {
        setSearchResult({ inputValue: debouncedInputValue, cities });
      }
    });

    return () => {
      isStale = true;
    };
  }, [debouncedInputValue, includeDistricts]);

  return {
    cities: searchResult.inputValue === debouncedInputValue ? searchResult.cities : [],
    isSearching: inputValue !== '' && searchResult.inputValue !== inputValue,
  };
}
