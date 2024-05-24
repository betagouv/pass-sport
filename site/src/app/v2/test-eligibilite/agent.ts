export const fetchPspCode = (formData: FormData): Promise<{ status: number; body: unknown }> => {
  const url = `/v2/api/eligibility-test/confirm`;

  return fetch(url, { method: 'POST', body: formData }).then(async (response) => ({
    status: response.status,
    body: (await response.json()) as unknown,
  }));
};
