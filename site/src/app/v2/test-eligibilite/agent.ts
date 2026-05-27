import {
  ConfirmResponseErrorBody,
  EnhancedConfirmResponseBody,
  SearchResponseBody,
  SearchResponseErrorBody,
} from 'types/EligibilityTest';

export const fetchEligible = (
  formData: FormData,
): Promise<{ status: number; body: SearchResponseBody | SearchResponseErrorBody }> => {
  const url = `/v2/api/eligibility-test/search`;

  return fetch(url, { method: 'POST', body: formData }).then(async (response) => ({
    status: response.status,
    body: (await response.json()) as SearchResponseBody | SearchResponseErrorBody,
  }));
};

export const fetchPspCode = (
  formData: FormData,
): Promise<{ status: number; body: EnhancedConfirmResponseBody | ConfirmResponseErrorBody }> => {
  const url = `/v2/api/eligibility-test/confirm`;

  return fetch(url, { method: 'POST', body: formData }).then(async (response) => ({
    status: response.status,
    body: (await response.json()) as EnhancedConfirmResponseBody | ConfirmResponseErrorBody,
  }));
};
