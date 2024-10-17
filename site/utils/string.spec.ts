import { matchExactDrajes } from '@/utils/string';

describe('string tests suite', () => {
  describe('matchExactDrajes() tests cases', () => {
    it('Should match', () => {
      // Example usage:
      expect(matchExactDrajes('DRAJES')).toBeTruthy();
      expect(matchExactDrajes('drajes')).toBeTruthy();
      expect(matchExactDrajes('something drajes else')).toBeTruthy();
      expect(matchExactDrajes('je suis de la DRAJES')).toBeTruthy();
      expect(matchExactDrajes('je suis de la DRAJES,')).toBeTruthy();
      expect(matchExactDrajes('je suis de la DRAJES;')).toBeTruthy();
    });

    it('Should not match', () => {
      expect(matchExactDrajes('somethingDRAJESelse')).toBeFalsy();
      expect(matchExactDrajes('Drajesibus')).toBeFalsy();
    });
  });
});
