import { fetchEligible } from '@/app/services/eligibility-test';
import { SearchPayload } from 'types/EligibilityTest';
import { zfd } from 'zod-form-data';
import z, { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { handleSupportCookie } from '@/utils/cookie';

const schema = zfd.formData({
  beneficiaryLastname: z.string(),
  beneficiaryFirstname: z.string(),
  beneficiaryBirthDate: z.string(),
  recipientResidencePlace: z.string(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const payload: SearchPayload = schema.parse(formData);

    const data = await fetchEligible(payload);

    // Means no one was found
    if (Array.isArray(data) && data.length <= 0) {
      await handleSupportCookie(payload, 'search');
    }

    return Response.json(data);
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json('Some fields are missing', { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('Technical error on LCA POST api/eligibility-test/search');
      scope.captureException(e);
    });

    return Response.json('Internal error', { status: 500 });
  }
}
