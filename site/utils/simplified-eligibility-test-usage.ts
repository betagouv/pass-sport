export const ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY =
  'ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST';

// localStorage throws (not returns null) under Safari private browsing and hardened privacy settings
function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasAlreadyUsedSimplifiedEligibilityTest(): boolean {
  const storage = getStorage();

  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSimplifiedEligibilityTestAsUsed(): void {
  const storage = getStorage();

  try {
    storage?.setItem(ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY, 'true');
  } catch {
    // Storage unavailable, the flag is best effort
  }
}

export function clearSimplifiedEligibilityTestUsage(): void {
  const storage = getStorage();

  try {
    storage?.removeItem(ALREADY_USED_SIMPLIFIED_ELIGIBILITY_TEST_KEY);
  } catch {
    // Storage unavailable, nothing to clear
  }
}
