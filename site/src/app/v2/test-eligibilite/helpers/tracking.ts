import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';

export const situationTrackingName = (allowance: ALLOWANCE | null, caisse: CAISSE | null): string =>
  [allowance, caisse].filter(Boolean).join('-');
