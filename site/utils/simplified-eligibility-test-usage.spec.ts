import {
  ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY,
  clearSimplifiedEligibilityTestUsage,
  hasAlreadyUsedSimplifiedEligibilityTest,
  markSimplifiedEligibilityTestAsUsed,
} from './simplified-eligibility-test-usage';

describe('Simplified eligibility test usage suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('hasAlreadyUsedSimplifiedEligibilityTest()', () => {
    it('should return false when nothing is stored', () => {
      expect(hasAlreadyUsedSimplifiedEligibilityTest()).toBe(false);
    });

    it('should return false on an unexpected stored value', () => {
      localStorage.setItem(ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY, 'maybe');

      expect(hasAlreadyUsedSimplifiedEligibilityTest()).toBe(false);
    });

    it('should return true once the test has been used', () => {
      markSimplifiedEligibilityTestAsUsed();

      expect(localStorage.getItem(ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY)).toBe('true');
      expect(hasAlreadyUsedSimplifiedEligibilityTest()).toBe(true);
    });
  });

  describe('clearSimplifiedEligibilityTestUsage()', () => {
    it('should remove the stored flag', () => {
      markSimplifiedEligibilityTestAsUsed();
      clearSimplifiedEligibilityTestUsage();

      expect(hasAlreadyUsedSimplifiedEligibilityTest()).toBe(false);
    });
  });
});
