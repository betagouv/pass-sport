import { ALLOCATION, CAISSE } from './eligibility-test';
import {
  clearEligibilityTest,
  PASS_SPORT_ELIGIBILITY_TEST_KEY,
  readEligibilityTest,
  writeEligibilityTest,
} from './eligibility-test-storage';

describe('Eligibility test storage suite', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('PASS_SPORT_ELIGIBILITY_TEST_KEY', () => {
    it('should be prefixed with PASS_SPORT and the uppercased env', () => {
      expect(PASS_SPORT_ELIGIBILITY_TEST_KEY).toMatch(/^PASS_SPORT_[A-Z0-9]+_ELIGIBILITY_TEST$/);
    });
  });

  describe('readEligibilityTest()', () => {
    it('should return null when nothing is stored', () => {
      expect(readEligibilityTest()).toBeNull();
    });

    it('should return null on malformed JSON', () => {
      sessionStorage.setItem(PASS_SPORT_ELIGIBILITY_TEST_KEY, '{not json');

      expect(readEligibilityTest()).toBeNull();
    });

    it('should return null when the stored value is not an object', () => {
      sessionStorage.setItem(PASS_SPORT_ELIGIBILITY_TEST_KEY, '"a string"');

      expect(readEligibilityTest()).toBeNull();
    });

    it('should null out an unknown situation', () => {
      sessionStorage.setItem(
        PASS_SPORT_ELIGIBILITY_TEST_KEY,
        JSON.stringify({ dob: '2015-12-31', situation: 'ars' }),
      );

      expect(readEligibilityTest()).toEqual({ dob: '2015-12-31', situation: null, caisse: null });
    });

    it('should null out an unknown caisse', () => {
      sessionStorage.setItem(
        PASS_SPORT_ELIGIBILITY_TEST_KEY,
        JSON.stringify({ dob: '2015-12-31', situation: ALLOCATION.QF, caisse: 'cnous' }),
      );

      expect(readEligibilityTest()).toEqual({
        dob: '2015-12-31',
        situation: ALLOCATION.QF,
        caisse: null,
      });
    });

    it('should null out a non-string dob', () => {
      sessionStorage.setItem(
        PASS_SPORT_ELIGIBILITY_TEST_KEY,
        JSON.stringify({ dob: 20151231, situation: ALLOCATION.QF }),
      );

      expect(readEligibilityTest()).toEqual({ dob: null, situation: ALLOCATION.QF, caisse: null });
    });

    it('should null out a dob that is not an ISO date', () => {
      sessionStorage.setItem(
        PASS_SPORT_ELIGIBILITY_TEST_KEY,
        JSON.stringify({ dob: '31/12/2015', situation: ALLOCATION.QF }),
      );

      expect(readEligibilityTest()).toEqual({ dob: null, situation: ALLOCATION.QF, caisse: null });
    });
  });

  describe('writeEligibilityTest()', () => {
    it('should round trip both values', () => {
      writeEligibilityTest({ dob: '2015-12-31', situation: ALLOCATION.QF, caisse: CAISSE.CAF });

      expect(readEligibilityTest()).toEqual({
        dob: '2015-12-31',
        situation: ALLOCATION.QF,
        caisse: CAISSE.CAF,
      });
    });

    it('should store both values under a single key', () => {
      writeEligibilityTest({ dob: '2015-12-31', situation: ALLOCATION.AAH, caisse: CAISSE.MSA });

      expect(JSON.parse(sessionStorage.getItem(PASS_SPORT_ELIGIBILITY_TEST_KEY)!)).toEqual({
        dob: '2015-12-31',
        situation: ALLOCATION.AAH,
        caisse: CAISSE.MSA,
      });
    });

    it('should merge a partial patch instead of replacing', () => {
      writeEligibilityTest({ dob: '2015-12-31' });
      writeEligibilityTest({ situation: ALLOCATION.AEEH });
      writeEligibilityTest({ caisse: CAISSE.CAF });

      expect(readEligibilityTest()).toEqual({
        dob: '2015-12-31',
        situation: ALLOCATION.AEEH,
        caisse: CAISSE.CAF,
      });
    });

    it('should fill missing fields with null', () => {
      expect(writeEligibilityTest({ dob: '2015-12-31' })).toEqual({
        dob: '2015-12-31',
        situation: null,
        caisse: null,
      });
    });

    it('should return the merged value', () => {
      writeEligibilityTest({ dob: '2015-12-31' });

      expect(writeEligibilityTest({ situation: ALLOCATION.CROUS })).toEqual({
        dob: '2015-12-31',
        situation: ALLOCATION.CROUS,
        caisse: null,
      });
    });
  });

  describe('clearEligibilityTest()', () => {
    it('should remove the key', () => {
      writeEligibilityTest({ dob: '2015-12-31', situation: ALLOCATION.QF });
      clearEligibilityTest();

      expect(sessionStorage.getItem(PASS_SPORT_ELIGIBILITY_TEST_KEY)).toBeNull();
      expect(readEligibilityTest()).toBeNull();
    });
  });

  describe('when sessionStorage is unavailable', () => {
    // Safari private browsing throws on access rather than returning null
    let spy: jest.SpyInstance;

    beforeEach(() => {
      spy = jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
        throw new Error('SecurityError');
      });
    });

    afterEach(() => {
      spy.mockRestore();
    });

    it('should not throw and should degrade to null', () => {
      expect(() => clearEligibilityTest()).not.toThrow();
      expect(readEligibilityTest()).toBeNull();
      expect(writeEligibilityTest({ dob: '2015-12-31' })).toBeNull();
    });
  });
});
