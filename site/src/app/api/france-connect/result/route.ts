import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { findResultsForSub } from '@/app/services/applications';
import { loadPocResult } from '@/app/api/france-connect/session';

export async function GET(): Promise<Response> {
  try {
    const pocResult = await loadPocResult();

    if (!pocResult) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const beneficiaries = await findResultsForSub(pocResult.sub);

    if (beneficiaries.length === 0) {
      return NextResponse.json({ status: 'pending' });
    }

    return NextResponse.json({ status: 'done', beneficiaries });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC result lookup failed');
      scope.captureException(e);
    });

    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
