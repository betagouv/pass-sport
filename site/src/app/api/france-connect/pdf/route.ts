import * as Sentry from '@sentry/nextjs';
import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import type { BeneficiaryResult } from '@/app/services/applications';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';

// The caller names a child by its position in their own result set rather than by its code: an
// index is opaque, not replayable, and safe to see in an access log. No position is addressable
// that findResultsForSub did not already return for the authenticated sub.
const selectTarget = (
  results: BeneficiaryResult[],
  beneficiaryIndex: string | null,
): BeneficiaryResult | undefined => {
  if (beneficiaryIndex === null) {
    return results.find((r) => r.source === 'self' && r.verdict === 'eligible_confirmed' && r.code);
  }

  // Digits only: Number() would otherwise turn '', ' ' or '0x1' into a valid position.
  const candidate = /^\d+$/.test(beneficiaryIndex) ? results[Number(beneficiaryIndex)] : undefined;
  return candidate?.source === 'enfant' && candidate.verdict === 'eligible_confirmed'
    ? candidate
    : undefined;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const pocResult = await loadPocResult();

    if (!pocResult) {
      return Response.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const beneficiaryIndex = new URL(request.url).searchParams.get('beneficiary');
    const results = await findResultsForSub(pocResult.sub);
    const target = selectTarget(results, beneficiaryIndex);

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
