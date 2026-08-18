import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { Allowance, enqueueCodesJob } from '@/app/services/queue';
import { loadPocResult } from '@/app/v2/api/france-connect/session';
import { getClientIp } from '@/utils/client-ip';

const schema = z.object({
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

    if (existing) {
      return NextResponse.json(
        { queued: false, alreadyQueued: true, state: existing.state },
        { status: 409 },
      );
    }

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
