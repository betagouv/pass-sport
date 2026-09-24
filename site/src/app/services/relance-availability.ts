import { findApplicationForSub, findLastRelanceForSub } from '@/app/services/applications';
import { nextRelanceAt } from '@/app/services/relance';

// Server-only: relance.ts is bundled client-side.
export const relanceAvailableAtForSub = async (sub: string): Promise<Date | null> => {
  const [lastRelance, application] = await Promise.all([
    findLastRelanceForSub(sub),
    findApplicationForSub(sub),
  ]);

  return nextRelanceAt(lastRelance, application?.lastApplication ?? null);
};
