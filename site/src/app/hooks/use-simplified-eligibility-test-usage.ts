import { useCallback, useSyncExternalStore } from 'react';
import {
  hasAlreadyUsedSimplifiedEligibilityTest,
  markSimplifiedEligibilityTestAsUsed,
} from '@/utils/simplified-eligibility-test-usage';

const listeners = new Set<() => void>();

let snapshot: boolean | null = null;

function getSnapshot(): boolean {
  if (snapshot === null) {
    snapshot = hasAlreadyUsedSimplifiedEligibilityTest();
  }

  return snapshot;
}

// Nothing is stored on the server, which keeps the server render and the hydration render identical
function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useSimplifiedEligibilityTestUsage() {
  const hasAlreadyUsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const markAsUsed = useCallback(() => {
    markSimplifiedEligibilityTestAsUsed();
    snapshot = true;
    listeners.forEach((listener) => listener());
  }, []);

  return { hasAlreadyUsed, markAsUsed };
}
