import type { BeneficiaryResult } from '@/app/services/applications';
import { FC_RELANCE_COOLDOWN_DAYS } from '@/app/constants/env';

const DAY_MS = 86_400_000;

export const canRerun = (beneficiaries: BeneficiaryResult[], allowlistOnly: boolean): boolean =>
  beneficiaries.length > 0 &&
  (!allowlistOnly || beneficiaries.some(({ relanceAllowed }) => relanceAllowed));

export const nextRelanceAt = (lastRelance: Date | null, lastRun: Date | null): Date | null => {
  const since = [lastRelance, lastRun].reduce<Date | null>(
    (latest, date) => (date && (!latest || date > latest) ? date : latest),
    null,
  );

  if (!since) {
    return null;
  }

  const next = new Date(since.getTime() + FC_RELANCE_COOLDOWN_DAYS * DAY_MS);

  return next > new Date() ? next : null;
};
