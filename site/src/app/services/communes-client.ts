'use client';

import * as Sentry from '@sentry/nextjs';
import { City } from '@/types/City';

const fetchCommunes = async (params: URLSearchParams, context: string): Promise<City[]> => {
  try {
    const response = await fetch(`/api/communes?${params.toString()}`);

    if (!response.ok) {
      Sentry.withScope((scope) => {
        scope.setLevel('warning');
        scope.setExtra('responseStatus', response.status);
        scope.captureMessage(`Unexpected response from /api/communes; context: ${context}`);
      });

      return [];
    }

    return response.json();
  } catch {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.captureMessage(`/api/communes request failed; context: ${context}`);
    });

    return [];
  }
};

export const getFranceCitiesByName = (
  cityName: string,
  includeDistricts: boolean,
): Promise<City[]> => {
  const params = new URLSearchParams();
  params.append('name', cityName);
  params.append('includeDistricts', includeDistricts.toString());

  return fetchCommunes(params, 'search by name');
};

export const getFranceCitiesByPostalCodeAndCityName = (
  postalCode: string,
  cityName: string,
  includeDistricts: boolean,
): Promise<City[]> => {
  const params = new URLSearchParams();
  params.append('name', cityName);
  params.append('postalCode', postalCode);
  params.append('includeDistricts', includeDistricts.toString());

  return fetchCommunes(params, 'search by postal code and name');
};
