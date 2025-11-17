import { fetchCode } from '@/app/services/eligibility-test';
import { ConfirmPayload, ConfirmResponseBodyItem } from 'types/EligibilityTest';
import { zfd } from 'zod-form-data';
import z, { ZodError } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { handleSupportCookie } from '@/utils/cookie';
import { generatePdfBuffer } from '@/app/v2/api/eligibility-test/confirm/generate-pdf-buffer';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

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
  allowanceName: z.nativeEnum(ALLOWANCE).optional(),
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
      if (payload.situation.toLowerCase() === 'boursier' && payload.recipientIneNumber) {
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

    const hasDataForPdfGeneration =
      Array.isArray(data) &&
      data.length > 0 &&
      !('message' in data) &&
      ['prenom', 'nom', 'date_naissance', 'id_psp', 'genre'].filter((key) => key in data[0]);

    if (hasDataForPdfGeneration) {
      const { nom, prenom, date_naissance, genre, id_psp } = data[0] as ConfirmResponseBodyItem;
      const pdfBuffer = await generatePdfBuffer({
        lastname: nom,
        firstname: prenom,
        dob: date_naissance,
        gender: genre,
        code: id_psp,
      });

      return Response.json(
        [
          {
            ...data[0],
            pdf_base_64: pdfBuffer.toString('base64'),
          },
          data.slice(1),
        ].flat(),
      );
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
