import * as Sentry from '@sentry/nextjs';
import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';

// Serves the allocataire's own pass Sport code as a PDF, generated on demand rather than
// embedded in the page.
//
// No request input is accepted at all — no id, no sub, no code — precisely so there is nothing
// for one visitor to swap out to reach another visitor's document. The route instead re-derives
// every field it needs from the caller's own session:
//   - `pocResult` requires the httpOnly `POC_SESSION_COOKIE`, minted by the FranceConnect
//     callback and readable only server-side. No cookie (never authenticated, or the 10-minute
//     session already expired) means no PDF: 401 before anything else runs.
//   - `pocResult.sub` — the FranceConnect pseudonym tied to that cookie/session, never a
//     client-supplied value — is the only key used to look up results, so the query can only
//     ever return the caller's own row.
//   - the identity on the document (`pocResult.identity`) comes from that same session object,
//     populated once at the OIDC callback from FranceConnect's own userinfo response — not from
//     this request — so nobody can pass a different name in to have it printed on the PDF.
//
// Only the 'self' beneficiary is served: application_results_by_sub deliberately exposes only
// a given_name for 'enfant' rows (see the Verdict comment in @/app/services/applications) —
// not enough identity to produce a genuine document, so enfant rows get no download link at all.
export async function GET(): Promise<Response> {
  try {
    const pocResult = await loadPocResult();

    if (!pocResult) {
      return Response.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const results = await findResultsForSub(pocResult.sub);
    const self = results.find(
      (r) => r.source === 'self' && r.verdict === 'eligible_confirmed' && r.code,
    );

    if (!self?.code) {
      return Response.json({ error: 'Aucun code disponible.' }, { status: 404 });
    }

    const { given_name, family_name, birthdate, gender } = pocResult.identity;

    if (!family_name || !birthdate) {
      return Response.json({ error: 'Identité incomplète.' }, { status: 422 });
    }

    const pdf = await generatePdfBuffer({
      firstname: given_name ?? '',
      lastname: family_name,
      dob: birthdate,
      code: self.code,
      gender: gender === 'male' ? 'M' : 'F',
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="pass-sport-${self.code}.pdf"`,
        // The PDF carries the allocataire's name, birthdate and code — never let a shared
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
