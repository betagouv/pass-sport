import { fetchCode } from '@/app/services/eligibility-test';
import { ConfirmPayload } from 'types/EligibilityTest';
import { zfd } from 'zod-form-data';
import z, { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { handleSupportCookie } from '@/utils/cookie';
import { isSanitairesAndSociauxBoursiersBFC } from '@/app/v2/test-eligibilite-base/helpers/helpers';

const DEFAULT_INSEE_CODE = '75113';

const schema = zfd.formData({
  id: z.string(),
  situation: z.enum(['AAH', 'jeune', 'Jeune', 'boursier']),
  organisme: z.enum(['CAF', 'MSA', 'cnous']),
  recipientLastname: z.string().optional(),
  recipientFirstname: z.string().optional(),
  recipientIneNumber: z.string().optional(),
  recipientCafNumber: z.string().optional(),
  recipientBirthPlace: z.string().optional(),
  recipientBirthDate: z.string().optional(),
  recipientBirthCountry: z.string().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const payload: ConfirmPayload = schema.parse(formData);

    if (payload.situation.toLowerCase() === 'jeune') {
      payload.situation = 'jeune';
    }

    const data = await fetchCode(payload);

    // Means no one was found
    if (Array.isArray(data) && data.length <= 0) {
      // Temporary
      // Boursiers sanitaires sociaux BFC (Bourgogne France Comté)
      if (
        payload.situation.toLowerCase() === 'boursier' &&
        payload.recipientIneNumber &&
        isSanitairesAndSociauxBoursiersBFC(payload.recipientIneNumber)
      ) {
        const dataWithOverridenBirthPlace = await fetchCode({
          ...payload,
          recipientBirthPlace: DEFAULT_INSEE_CODE,
        });

        if (Array.isArray(dataWithOverridenBirthPlace) && dataWithOverridenBirthPlace.length <= 0) {
          await handleSupportCookie(payload, 'confirm');
        }

        return Response.json(dataWithOverridenBirthPlace);
      } else {
        await handleSupportCookie(payload, 'confirm');
      }
    }

    return Response.json(data);
  } catch (e) {
    if (e instanceof ZodError) {
      return Response.json('Some fields are missing', { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('Technical error on LCA POST api/eligibility-test/confirm');
      scope.captureException(e);
    });
    return Response.json('Internal error', { status: 500 });
  }
}
