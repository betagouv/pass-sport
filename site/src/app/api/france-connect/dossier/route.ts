import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { FC_DN_DOSSIER_ENABLED } from '@/app/constants/env';
import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import { findDnDossierForSub } from '@/app/services/dn-dossier';
import { hasRefusal } from '@/app/services/dn-dossier-rules';
import { enqueueFcDnDossierJob, findDnDossierJobState } from '@/app/services/queue';
import { getClientIp } from '@/utils/client-ip';

// The answer can carry the dossier's bearer URL.
const reply = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

const reportFailure = (message: string, e: unknown) =>
  Sentry.withScope((scope) => {
    scope.setLevel('error');
    scope.captureMessage(message);
    scope.captureException(e);
  });

// Asks the worker for the usager's dossier: theirs if Démarche Numérique still lists it, a new
// pre-filled one otherwise.
export async function POST(request: Request): Promise<Response> {
  try {
    if (!FC_DN_DOSSIER_ENABLED) {
      return reply({ error: 'Non disponible.' }, 404);
    }

    const pocResult = await loadPocResult();

    if (!pocResult) {
      return reply({ error: 'Session expirée.' }, 401);
    }

    const { sub, identity } = pocResult;

    // Hiding the button does not close the endpoint: only a refused household, or one that
    // already holds a dossier, gets one.
    if (!hasRefusal(await findResultsForSub(sub)) && !(await findDnDossierForSub(sub))) {
      return reply({ error: 'Non disponible.' }, 403);
    }

    const { queued } = await enqueueFcDnDossierJob(
      {
        identity: {
          sub,
          family_name: identity.family_name,
          given_name: identity.given_name,
          birthdate: identity.birthdate,
          gender: identity.gender,
        },
        clientIp: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
      },
      sub,
    );

    return reply({ queued }, 202);
  } catch (e) {
    reportFailure('FranceConnect DN dossier request failed', e);

    return reply({ error: 'Erreur interne.' }, 500);
  }
}

export async function GET(): Promise<Response> {
  try {
    if (!FC_DN_DOSSIER_ENABLED) {
      return reply({ error: 'Non disponible.' }, 404);
    }

    const pocResult = await loadPocResult();

    if (!pocResult) {
      return reply({ error: 'Session expirée.' }, 401);
    }

    const jobState = await findDnDossierJobState(pocResult.sub);

    if (jobState === 'live') {
      return reply({ status: 'pending' });
    }

    if (jobState === 'failed') {
      return reply({ status: 'failed' });
    }

    const dossier = await findDnDossierForSub(pocResult.sub);

    return reply(dossier ? { status: 'ready', dossier } : { status: 'none' });
  } catch (e) {
    reportFailure('FranceConnect DN dossier lookup failed', e);

    return reply({ error: 'Erreur interne.' }, 500);
  }
}
