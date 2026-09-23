import type { BeneficiaryResult } from '@/app/services/applications';
import { FC_RELANCE_COOLDOWN_DAYS } from '@/app/constants/env';

const DAY_MS = 86_400_000;

export const canRerun = (beneficiaries: BeneficiaryResult[], allowlistOnly: boolean): boolean =>
  beneficiaries.some(
    ({ verdict, relanceAllowed }) =>
      verdict === 'not_eligible' && (!allowlistOnly || relanceAllowed),
  );

// To prevent unnecessary calls to API Particulier
export const nextRelanceAt = (lastRelance: Date | null): Date | null => {
  if (!lastRelance) {
    return null;
  }

  const next = new Date(lastRelance.getTime() + FC_RELANCE_COOLDOWN_DAYS * DAY_MS);

  return next > new Date() ? next : null;
};
