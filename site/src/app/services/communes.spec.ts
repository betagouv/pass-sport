import { createCommuneSearch, type RawCommune } from './communes';

// A small fixture, not the real ~41k-row dataset: covers accent-insensitive matching, token
// (not whole-string) prefix matching, includeDistricts filtering, the ordinal-suffix matching a
// district search like "Paris 2eme" needs, and former communes / historical codes.
const fixtureCommunes: RawCommune[] = [
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
    codeParent: '75056',
  },
  {
    code: '75102',
    nom: 'Paris 2e Arrondissement',
    codesPostaux: ['75002'],
    codeDepartement: '75',
    isDistrict: true,
    codeParent: '75056',
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
  {
    code: '61474',
    nom: 'Gouffern en Auge',
    codesPostaux: ['61160', '61200', '61310'],
    codeDepartement: '61',
    isDistrict: false,
  },
  {
    code: '61157',
    nom: 'Exmes',
    codesPostaux: ['61310'],
    codeDepartement: '61',
    isDistrict: false,
    codesHistoriques: ['61157'],
    communeActuelle: { code: '61474', nom: 'Gouffern en Auge' },
  },
  {
    code: '61268',
    nom: 'Ménil-Hubert-en-Exmes',
    codesPostaux: ['61230'],
    codeDepartement: '61',
    isDistrict: false,
  },
  {
    code: '91182',
    nom: 'Courcouronnes',
    codesPostaux: ['91080'],
    codeDepartement: '91',
    isDistrict: false,
    codesHistoriques: ['78182', '91182'],
    communeActuelle: { code: '91228', nom: 'Évry-Courcouronnes' },
  },
  {
    code: '2A004',
    nom: 'Ajaccio',
    codesPostaux: ['20000'],
    codeDepartement: '2A',
    isDistrict: false,
    codesHistoriques: ['20004'],
  },
];

const BIRTH_PLACE = { includeDistricts: true, includeFormer: true };
const RESIDENCE = { ...BIRTH_PLACE, excludeDistrictParents: true };
const CLUB_FINDER = { includeDistricts: false };

describe('communes service', () => {
  const { searchCommunesByName, searchCommunesByPostalCodeAndName, lcaCandidateCodes } =
    createCommuneSearch(fixtureCommunes);

  const codes = (cities: { code: string }[]) => cities.map((city) => city.code);

  describe('searchCommunesByName', () => {
    it('matches regardless of accents in the query', () => {
      expect(codes(searchCommunesByName('amberieu', CLUB_FINDER))).toEqual(['01004']);
    });

    it('matches on a token prefix, not just a whole-name prefix', () => {
      expect(codes(searchCommunesByName('roch', CLUB_FINDER))).toEqual(['17300']);
    });

    it('excludes arrondissements when includeDistricts is false', () => {
      expect(codes(searchCommunesByName('paris', CLUB_FINDER))).toEqual(['75056']);
    });

    it('finds Paris 2e Arrondissement for a colloquially-typed ordinal like "Paris 2eme"', () => {
      expect(codes(searchCommunesByName('Paris 2eme', BIRTH_PLACE))).toContain('75102');
    });

    it('never returns an arrondissement when includeDistricts is false, even for the same query', () => {
      expect(codes(searchCommunesByName('Paris 2eme', CLUB_FINDER))).not.toContain('75102');
    });

    it('returns nothing for an empty query', () => {
      expect(searchCommunesByName('', BIRTH_PLACE)).toEqual([]);
    });

    it('leaves former communes out unless asked for', () => {
      expect(codes(searchCommunesByName('exmes', CLUB_FINDER))).toEqual(['61268']);
    });

    it('returns a former commune with the current commune it belongs to', () => {
      const [exmes] = searchCommunesByName('exmes', BIRTH_PLACE).filter(
        (city) => city.code === '61157',
      );

      expect(exmes.communeActuelle).toEqual({ code: '61474', nom: 'Gouffern en Auge' });
    });

    it('ranks a name-prefix match first, even for a former commune', () => {
      expect(codes(searchCommunesByName('exmes', BIRTH_PLACE))).toEqual(['61157', '61268']);
    });

    it('hides Paris, Lyon and Marseille themselves when excludeDistrictParents is set', () => {
      const results = codes(searchCommunesByName('paris', RESIDENCE));

      expect(results).not.toContain('75056');
      expect(results).toEqual(expect.arrayContaining(['75101', '75102']));
    });

    describe('by INSEE code', () => {
      it('finds a former commune by its code behind a "#"', () => {
        expect(codes(searchCommunesByName('#61157', BIRTH_PLACE))).toEqual(['61157']);
      });

      it('finds a commune by one of its historical codes', () => {
        expect(codes(searchCommunesByName('#78182', BIRTH_PLACE))).toEqual(['91182']);
        expect(codes(searchCommunesByName('#20004', BIRTH_PLACE))).toEqual(['2A004']);
      });

      it('accepts a lowercase Corsican code', () => {
        expect(codes(searchCommunesByName('#2a004', BIRTH_PLACE))).toEqual(['2A004']);
      });

      it('never reads a bare 5-digit query as an INSEE code, which could be a postal code', () => {
        expect(searchCommunesByName('61157', BIRTH_PLACE)).toEqual([]);
      });
    });
  });

  describe('searchCommunesByPostalCodeAndName', () => {
    it('combines a postal code with a name match, including districts on request', () => {
      const results = searchCommunesByPostalCodeAndName('75002', 'paris', BIRTH_PLACE);

      expect(codes(results)).toEqual(expect.arrayContaining(['75056', '75102']));
    });

    it('filters out communes whose postal code does not match', () => {
      expect(searchCommunesByPostalCodeAndName('01500', 'paris', BIRTH_PLACE)).toEqual([]);
    });

    it('ranks a current commune before a former one of equal relevance', () => {
      expect(codes(searchCommunesByPostalCodeAndName('61310', '', BIRTH_PLACE))).toEqual([
        '61474',
        '61157',
      ]);
    });

    it('finds a former commune by its own postal code', () => {
      expect(codes(searchCommunesByPostalCodeAndName('61310', 'exmes', BIRTH_PLACE))).toEqual([
        '61157',
      ]);
    });
  });

  describe('lcaCandidateCodes', () => {
    it('only tries the code itself for an ordinary current commune', () => {
      expect(lcaCandidateCodes('01004')).toEqual(['01004']);
    });

    it('tries the current commune first, then the former commune code', () => {
      expect(lcaCandidateCodes('61157')).toEqual(['61474', '61157']);
    });

    it('tries every code a former commune held', () => {
      expect(lcaCandidateCodes('91182')).toEqual(['91228', '91182', '78182']);
    });

    it('tries the city after an arrondissement', () => {
      expect(lcaCandidateCodes('75102')).toEqual(['75102', '75056']);
    });

    it('never expands a city to its arrondissements', () => {
      expect(lcaCandidateCodes('75056')).toEqual(['75056']);
    });

    it('never expands a commune nouvelle to its former communes', () => {
      expect(lcaCandidateCodes('61474')).toEqual(['61474']);
    });

    it('tries the pre-1976 code of a Corsican commune', () => {
      expect(lcaCandidateCodes('2A004')).toEqual(['2A004', '20004']);
    });

    it('passes an unknown code through untouched', () => {
      expect(lcaCandidateCodes('99999')).toEqual(['99999']);
    });
  });
});
