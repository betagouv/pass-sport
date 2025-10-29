import { matchExactDrajes, matchExactLsm } from '@/utils/string';

describe('string tests suite', () => {
  describe('matchExactDrajes() tests cases', () => {
    it('Should match', () => {
      // Example usage:
      expect(matchExactDrajes('DRAJES')).toBeTruthy();
      expect(matchExactDrajes('drajes')).toBeTruthy();
      expect(matchExactDrajes('something drajes else')).toBeTruthy();
      expect(matchExactDrajes('je suis de la DRAJES')).toBeTruthy();
    });

    it('Should not match', () => {
      expect(matchExactDrajes('somethingDRAJESelse')).toBeFalsy();
      expect(matchExactDrajes('Drajesibus')).toBeFalsy();
    });
  });

  describe('matchExactLsm() tests cases', () => {
    it('Should match', () => {
      const strings = ['LSMUSC2025', 'LSMACTIVE2025', 'LSMCOSMOS2025'];

      // Example usage:
      strings.forEach((str) => {
        expect(matchExactLsm(str)).toBeTruthy();
        expect(matchExactLsm(str.toLowerCase())).toBeTruthy();
        expect(matchExactLsm(`something ${str.toLowerCase()} else`)).toBeTruthy();
        expect(matchExactLsm(`je suis de la ${str}`)).toBeTruthy();
        expect(matchExactLsm(`je suis de la ${str.toLowerCase()},`)).toBeTruthy();
      });
    });

    it('Should not match', () => {
      const strings = ['LSMUSC2025', 'LSMACTIVE2025', 'LSMCOSMOS2025'];

      strings.forEach((str) => {
        expect(matchExactLsm(`something${str}else`)).toBeFalsy();
        expect(matchExactLsm(`test${str}`)).toBeFalsy();
      });
    });
  });
});
