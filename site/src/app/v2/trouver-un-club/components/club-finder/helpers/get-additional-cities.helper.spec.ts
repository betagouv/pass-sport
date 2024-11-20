import {
  getAdditionalCities,
  WHITELISTED_CITIES_MAPPING,
} from '@/app/v2/trouver-un-club/components/club-finder/helpers/get-additional-cities.helper';

describe('get-additional-cities helper tests suite', () => {
  it('should handle undefined parameter', () => {
    expect(getAdditionalCities(undefined)).toEqual([]);
  });

  it('should handle null parameter', () => {
    expect(getAdditionalCities(null)).toEqual([]);
  });

  it('should escape single quotes and uppercase input', () => {
    expect(getAdditionalCities(`Notre-Dame-d\'Oé`)).toEqual([`NOTRE-DAME-D\\'OÉ`]);
  });

  it.each(Object.keys(WHITELISTED_CITIES_MAPPING))(
    'should add whitelisted additional city %s and return an array of two cities',
    (initialCity) => {
      expect(getAdditionalCities(initialCity)).toEqual([
        initialCity,
        WHITELISTED_CITIES_MAPPING[initialCity],
      ]);
    },
  );

  it('should only return the initial city', () => {
    expect(getAdditionalCities('tEsT ciTy')).toEqual(['TEST CITY']);
  });
});
