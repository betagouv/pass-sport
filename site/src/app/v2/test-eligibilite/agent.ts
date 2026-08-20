import type { EligibilityTestRequest, VerdictResponseBody } from '@/types/EligibilityTest';

const VERDICT_PATH = '/api/eligibility-test/verdict';

// The form's only call. Both LCA steps happen behind it, so nothing here ever sees a
// "this person exists" answer on its own.
export const requestPassSportCode = async (
  request: EligibilityTestRequest,
): Promise<VerdictResponseBody> => {
  const response = await fetch(VERDICT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const body = (await response.json().catch(() => null)) as VerdictResponseBody | null;

  return body ?? { outcome: 'error', message: 'Internal error' };
};
