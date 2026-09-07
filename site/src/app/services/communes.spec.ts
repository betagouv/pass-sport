import { createCommuneSearch } from './communes';

// A small fixture, not the real ~35k-row dataset: covers accent-insensitive matching, token
// (not whole-string) prefix matching, includeDistricts filtering, and the ordinal-suffix
// matching a district search like "Paris 2eme" needs.
const fixtureCommunes = [
  {
    code: '75056',
    nom: 'Paris',
    codesPostaux: ['75001', '75002', '75116'],
    codeDepartement: '75',
    isDistrict: false,
  },
  {
    code: '75101',
    nom: 'Paris 1er Arrondissement',
    codesPostaux: ['75001'],
    codeDepartement: '75',
    isDistrict: true,
  },
  {
    code: '75102',
    nom: 'Paris 2e Arrondissement',
    codesPostaux: ['75002'],
    codeDepartement: '75',
    isDistrict: true,
  },
  {
    code: '01004',
    nom: 'Ambérieu-en-Bugey',
    codesPostaux: ['01500'],
    codeDepartement: '01',
    isDistrict: false,
  },
  {
    code: '17300',
    nom: 'La Rochelle',
    codesPostaux: ['17000'],
    codeDepartement: '17',
    isDistrict: false,
  },
];

describe('communes service', () => {
  const { searchCommunesByName, searchCommunesByPostalCodeAndName } =
    createCommuneSearch(fixtureCommunes);

  describe('searchCommunesByName', () => {
    it('matches regardless of accents in the query', () => {
      const results = searchCommunesByName('amberieu', false);

      expect(results.map((city) => city.code)).toEqual(['01004']);
    });

    it('matches on a token prefix, not just a whole-name prefix', () => {
      const results = searchCommunesByName('roch', false);

      expect(results.map((city) => city.code)).toEqual(['17300']);
    });

    it('excludes arrondissements when includeDistricts is false', () => {
      const results = searchCommunesByName('paris', false);

      expect(results.map((city) => city.code)).toEqual(['75056']);
    });

    it('finds Paris 2e Arrondissement for a colloquially-typed ordinal like "Paris 2eme"', () => {
      const results = searchCommunesByName('Paris 2eme', true);

      expect(results.map((city) => city.code)).toContain('75102');
    });

    it('never returns an arrondissement when includeDistricts is false, even for the same query', () => {
      const results = searchCommunesByName('Paris 2eme', false);

      expect(results.map((city) => city.code)).not.toContain('75102');
    });

    it('returns nothing for an empty query', () => {
      expect(searchCommunesByName('', true)).toEqual([]);
    });
  });

  describe('searchCommunesByPostalCodeAndName', () => {
    it('combines a postal code with a name match, including districts on request', () => {
      const results = searchCommunesByPostalCodeAndName('75002', 'paris', true);

      expect(results.map((city) => city.code)).toEqual(expect.arrayContaining(['75056', '75102']));
    });

    it('filters out communes whose postal code does not match', () => {
      const results = searchCommunesByPostalCodeAndName('01500', 'paris', true);

      expect(results).toEqual([]);
    });
  });
});
