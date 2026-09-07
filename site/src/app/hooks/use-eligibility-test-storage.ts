import { useCallback, useSyncExternalStore } from 'react';
import {
  clearEligibilityTest,
  readEligibilityTest,
  StoredEligibilityTest,
  writeEligibilityTest,
} from '@/utils/eligibility-test-storage';

const listeners = new Set<() => void>();

let snapshot: StoredEligibilityTest | null = null;
let isSnapshotStale = true;

// Snapshots are compared by reference, so the parsed entry is cached until a write invalidates it
function getSnapshot(): StoredEligibilityTest | null {
  if (isSnapshotStale) {
    snapshot = readEligibilityTest();
    isSnapshotStale = false;
  }

  return snapshot;
}

// Nothing is stored on the server, which keeps the server render and the hydration render identical
function getServerSnapshot(): StoredEligibilityTest | null {
  return null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function publish(next: StoredEligibilityTest | null): void {
  snapshot = next;
  isSnapshotStale = false;
  listeners.forEach((listener) => listener());
}

export function useEligibilityTestStorage() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const save = useCallback((patch: Partial<StoredEligibilityTest>) => {
    publish(writeEligibilityTest(patch));
  }, []);

  const clear = useCallback(() => {
    clearEligibilityTest();
    publish(null);
  }, []);

  return { stored, save, clear };
}
