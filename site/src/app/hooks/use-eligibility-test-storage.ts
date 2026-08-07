import { useCallback, useEffect, useState } from 'react';
import {
  clearEligibilityTest,
  readEligibilityTest,
  StoredEligibilityTest,
  writeEligibilityTest,
} from '@/utils/eligibility-test-storage';

export function useEligibilityTestStorage() {
  const [stored, setStored] = useState<StoredEligibilityTest | null>(null);

  // Read after mount so the server render and the first client render stay identical
  useEffect(() => {
    setStored(readEligibilityTest());
  }, []);

  const save = useCallback((patch: Partial<StoredEligibilityTest>) => {
    setStored(writeEligibilityTest(patch));
  }, []);

  const clear = useCallback(() => {
    clearEligibilityTest();
    setStored(null);
  }, []);

  return { stored, save, clear };
}
