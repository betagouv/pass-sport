import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { FC_RELANCE_JOB_NAME, enqueueFcRelanceJob, findLiveJobForSub } from '@/app/services/queue';
import { findResultsForSub } from '@/app/services/applications';
import { canRerun } from '@/app/services/relance';
import { relanceAvailableAtForSub } from '@/app/services/relance-availability';
import { FC_RELANCE_ALLOWLIST_ONLY, FC_RELANCE_ENABLED } from '@/app/constants/env';
import { loadPocResult } from '@/app/api/france-connect/session';
import { getClientIp } from '@/utils/client-ip';

export async function POST(request: Request): Promise<Response> {
  try {
    if (!FC_RELANCE_ENABLED) {
      return NextResponse.json({ error: 'Non disponible.' }, { status: 404 });
    }

    const pocResult = await loadPocResult();

    if (!pocResult) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    if (FC_RELANCE_ALLOWLIST_ONLY && !canRerun(await findResultsForSub(pocResult.sub), true)) {
      return NextResponse.json({ error: 'Non disponible.' }, { status: 403 });
    }

    const live = await findLiveJobForSub(pocResult.sub);

    if (live) {
      return NextResponse.json({ queued: false, state: live.state }, { status: 409 });
    }

    const availableAt = await relanceAvailableAtForSub(pocResult.sub);

    if (availableAt) {
      return NextResponse.json(
        { queued: false, availableAt: availableAt.toISOString() },
        { status: 429 },
      );
    }

    const { name } = await enqueueFcRelanceJob(
      {
        identity: pocResult.identity,
        isFranceConnected: true,
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      },
      pocResult.sub,
    );

    // A demande appeared between the check above and this add(), and now owns the id — nothing
    // was enqueued, so saying "enregistrée" would be a lie.
    if (name !== FC_RELANCE_JOB_NAME) {
      return NextResponse.json({ queued: false, state: 'existing' }, { status: 409 });
    }

    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect relance request failed');
      scope.captureException(e);
    });

    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
