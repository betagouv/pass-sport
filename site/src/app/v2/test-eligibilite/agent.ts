export const submitEligibilityRequest = (
  formData: FormData,
): Promise<{
  status: number;
  body: { queued?: boolean; alreadyQueued?: boolean; sentTo?: string; error?: string };
}> =>
  fetch('/v2/api/api-particulier/collect', { method: 'POST', body: formData }).then(
    async (response) => ({
      status: response.status,
      body: (await response.json().catch(() => ({}))) as {
        queued?: boolean;
        alreadyQueued?: boolean;
        // Masked by the database view, never assembled here.
        sentTo?: string;
        error?: string;
      },
    }),
  );
