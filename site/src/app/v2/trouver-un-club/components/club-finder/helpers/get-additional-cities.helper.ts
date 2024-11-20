import { escapeSingleQuotes } from '@/utils/string';

// /!\ This is a temporary workaround /!\
// Helper function used for getting additional city in the query to get list of clubs from opendatasoft through endpoint /records
// "commune" data retrieved from geo.api differs from https://sports-sgsocialgouv.opendatasoft.com/explore/dataset/passsports-asso_volontaires
// The "communes" belows are added in order to have a correct match between the communes received from the geo.api and the catalog from opendatasoft
// Example: The city returned by geo.api would be "LE RAINCY", but the ODS catalog contains "RAINCY", so the fix is to add "RAINCY" as well in the query to ODS
// We can get at most only two cities per returned array
export const WHITELISTED_CITIES_MAPPING: Record<string, string> = {
  'LE TOUVET': 'SAINT-HILAIRE-DU-TOUVET',
  'LE RAINCY': 'RAINCY',
};

export function getAdditionalCities(city?: string | null) {
  if (!city) return [];

  const _city = escapeSingleQuotes(city.trim().toUpperCase());

  if (_city in WHITELISTED_CITIES_MAPPING) {
    return [_city, WHITELISTED_CITIES_MAPPING[_city]];
  }

  return [_city];
}
