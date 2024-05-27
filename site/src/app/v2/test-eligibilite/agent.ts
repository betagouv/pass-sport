import { ConfirmResponseErrorBody, EnhancedConfirmResponseBody } from 'types/EligibilityTest';

export const fetchPspCode = (
  formData: FormData,
): Promise<{ status: number; body: EnhancedConfirmResponseBody | ConfirmResponseErrorBody }> => {
  const url = `/v2/api/eligibility-test/confirm`;

  return fetch(url, { method: 'POST', body: formData }).then(async (response) => ({
    status: response.status,
    body: (await response.json()) as EnhancedConfirmResponseBody | ConfirmResponseErrorBody,
  }));
};
