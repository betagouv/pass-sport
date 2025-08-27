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
      // Example usage:
      expect(matchExactLsm('LSMUSC2025')).toBeTruthy();
      expect(matchExactLsm('lsmusc2025')).toBeTruthy();
      expect(matchExactLsm('something lsmusc2025 else')).toBeTruthy();
      expect(matchExactLsm('je suis de la LSMUSC2025')).toBeTruthy();
      expect(matchExactLsm('je suis de la lsmusc2025,')).toBeTruthy();
    });

    it('Should not match', () => {
      expect(matchExactLsm('somethingLSMUSC2025else')).toBeFalsy();
      expect(matchExactLsm('testLSMUSC2025')).toBeFalsy();
    });
  });
});
