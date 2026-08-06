import { ALLOCATION, CAISSE } from './eligibility-test';

// Referenced inline so Next can statically replace it at build time
const ENV_PREFIX = (process.env.NEXT_PUBLIC_ENV ?? 'local').toUpperCase();

// Env in the prefix keeps entries from colliding when several environments share an origin
export const PASS_SPORT_ELIGIBILITY_TEST_KEY = `PASS_SPORT_${ENV_PREFIX}_ELIGIBILITY_TEST`;

export type StoredEligibilityTest = {
  dob: string | null;
  situation: ALLOCATION | null;
  caisse: CAISSE | null;
};

const EMPTY: StoredEligibilityTest = { dob: null, situation: null, caisse: null };

// Prefilling a type="date" input with anything else leaves the field blank while the state holds a value
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isAllocation(value: unknown): value is ALLOCATION {
  return Object.values(ALLOCATION).includes(value as ALLOCATION);
}

function isCaisse(value: unknown): value is CAISSE {
  return Object.values(CAISSE).includes(value as CAISSE);
}

// sessionStorage throws (not returns null) under Safari private browsing and hardened privacy settings
function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readEligibilityTest(): StoredEligibilityTest | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(PASS_SPORT_ELIGIBILITY_TEST_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const { dob, situation, caisse } = parsed as Record<keyof StoredEligibilityTest, unknown>;

    return {
      dob: typeof dob === 'string' && ISO_DATE.test(dob) ? dob : null,
      situation: isAllocation(situation) ? situation : null,
      caisse: isCaisse(caisse) ? caisse : null,
    };
  } catch {
    return null;
  }
}

export function writeEligibilityTest(
  patch: Partial<StoredEligibilityTest>,
): StoredEligibilityTest | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  const merged = { ...EMPTY, ...readEligibilityTest(), ...patch };

  try {
    storage.setItem(PASS_SPORT_ELIGIBILITY_TEST_KEY, JSON.stringify(merged));
  } catch {
    return null;
  }

  return merged;
}

export function clearEligibilityTest(): void {
  const storage = getStorage();

  try {
    storage?.removeItem(PASS_SPORT_ELIGIBILITY_TEST_KEY);
  } catch {
    // Storage unavailable, nothing to clear
  }
}
