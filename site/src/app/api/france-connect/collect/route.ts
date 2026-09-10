import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { enqueueCodesJob } from '@/app/services/queue';
import { loadPocResult } from '@/app/api/france-connect/session';
import { getClientIp } from '@/utils/client-ip';

// Bodyless: the journey collects nothing from the usager, and the callback already enqueues.
// This is the relaunch endpoint for the one case where that enqueue failed — the only way back
// without redoing the whole OIDC round trip.
export async function POST(request: Request): Promise<Response> {
  try {
    const pocResult = await loadPocResult();
    if (!pocResult) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const { existing } = await enqueueCodesJob(
      {
        identity: pocResult.identity,
        isFranceConnected: true,
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
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC collect step failed');
      scope.captureException(e);
    });

    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
