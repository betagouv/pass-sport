// POST body: { aides: Allowance[], residenceInsee: string }
import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { Allowance, enqueueCodesJob } from '@/app/services/queue';
import { loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { getClientIp } from '@/utils/client-ip';

const schema = z.object({
  // The POC's own routes (worker Allowance union), not the test-eligibilite enum.
  aides: z.array(z.enum(['QF', 'AEEH', 'AAH', 'CROUS'])).min(1),
  // INSEE commune code: 5 chars, digits except Corsica (2A/2B).
  residenceInsee: z.string().regex(/^\d[\dAB]\d{3}$/),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const pocResult = await loadPocResult();
    if (!pocResult) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const { aides, residenceInsee } = schema.parse(await request.json());

    const { existing } = await enqueueCodesJob(
      {
        identity: pocResult.identity,
        aides: aides as Allowance[],
        isFranceConnected: true,
        residenceInsee,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      },
      pocResult.sub,
    );

    // Reconnected after already submitting: the job id is their FranceConnect sub, so
    // nothing was enqueued. Report the existing request rather than pretending.
    // The session is deliberately NOT destroyed here — the page reads it to show the
    // existing job's status, and its 10-minute TTL cleans it up anyway.
    if (existing) {
      return NextResponse.json(
        { queued: false, alreadyQueued: true, state: existing.state },
        { status: 409 },
      );
    }

    // The session is deliberately NOT destroyed here. Deleting it logged the user out
    // on the very next page load, so a refresh right after submitting showed the
    // FranceConnect button again and no confirmation at all — the status block needs
    // the session's `sub` to look the request up (see page.tsx).
    //
    // The identity therefore stays in Redis for the remainder of the 10-minute session
    // TTL (session.ts SESSION_TTL_SECONDS) — the same window it already occupied before
    // this route ran. Logging out still destroys it immediately.

    // 202: the code is delivered asynchronously by email.
    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC collect step failed');
      scope.captureException(e);
    });
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
