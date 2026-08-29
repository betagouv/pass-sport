import * as Sentry from '@sentry/nextjs';
import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';

export async function GET(request: Request): Promise<Response> {
  try {
    const pocResult = await loadPocResult();

    if (!pocResult) {
      return Response.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const code = new URL(request.url).searchParams.get('code');
    const results = await findResultsForSub(pocResult.sub);
    const target = code
      ? results.find(
          (r) => r.source === 'enfant' && r.verdict === 'eligible_confirmed' && r.code === code,
        )
      : results.find((r) => r.source === 'self' && r.verdict === 'eligible_confirmed' && r.code);

    if (!target?.code) {
      return Response.json({ error: 'Aucun code disponible.' }, { status: 404 });
    }

    const identity =
      target.source === 'self'
        ? {
            firstname: pocResult.identity.given_name ?? '',
            lastname: pocResult.identity.family_name,
            dob: pocResult.identity.birthdate,
            gender: pocResult.identity.gender,
          }
        : {
            firstname: target.givenName ?? '',
            lastname: target.familyName,
            dob: target.birthdate,
            gender: target.gender,
          };

    if (!identity.lastname || !identity.dob) {
      return Response.json({ error: 'Identité incomplète.' }, { status: 422 });
    }

    const pdf = await generatePdfBuffer({
      firstname: identity.firstname,
      lastname: identity.lastname,
      dob: identity.dob,
      code: target.code,
      gender: identity.gender === 'male' ? 'M' : 'F',
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pass-sport-${target.code}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC pass Sport PDF generation failed');
      scope.captureException(e);
    });

    return Response.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
