import * as Sentry from '@sentry/nextjs';
import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';

// Serves a beneficiary's pass Sport code as a PDF, generated on demand rather than embedded
// in the page — the allocataire's own, or one of their children's.
//
// No identity is ever accepted from the request — precisely so there is nothing for one
// visitor to swap out to reach another visitor's document. The route instead re-derives every
// field it needs from the caller's own session and their own rows:
//   - `pocResult` requires the httpOnly `POC_SESSION_COOKIE`, minted by the FranceConnect
//     callback and readable only server-side. No cookie (never authenticated, or the 10-minute
//     session already expired) means no PDF: 401 before anything else runs.
//   - `pocResult.sub` — the FranceConnect pseudonym tied to that cookie/session, never a
//     client-supplied value — is the only key used to look up results, so the query can only
//     ever return the caller's own rows.
//   - the optional `code` query param is not an identity, just a discriminator among those
//     rows — it selects which of the caller's own eligible children to serve. A code that
//     isn't one of the caller's own 'enfant' rows simply matches nothing, same as any other
//     stray input, so it can't be used to reach someone else's document.
//   - the allocataire's own identity (`pocResult.identity`) comes from that same session
//     object, populated once at the OIDC callback from FranceConnect's own userinfo response.
//     An enfant's identity instead comes from application_results_by_sub, which carries
//     their given_name/family_name/birthdate/gender for exactly this purpose.
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
        // The PDF carries a beneficiary's name, birthdate and code — never let a shared
        // cache or the browser's disk cache hold onto it.
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
