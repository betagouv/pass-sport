// Reversed-flow step: called after login once the user confirms the aides
// bénéficiées + commune de résidence. This is the ONLY place API Particulier is
// called — restrained to the resources implied by the selected aides (see
// ALLOWANCE_RESOURCES in api-particulier.ts). Re-confirming with a different aide
// set therefore calls only the related resources.
//
// POST body: { aides: ALLOWANCE[], residenceInsee: string }

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { callApiParticulierIdentite } from '@/app/services/api-particulier';
import { AuditContext } from '@/app/services/audit';
import { getClientIp } from '@/utils/client-ip';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { loadPocResult, updatePocSession } from '@/app/v2/api/poc-fc-api-particulier/session';

const schema = z.object({
  aides: z.array(z.enum([ALLOWANCE.ARS, ALLOWANCE.AEEH, ALLOWANCE.AAH, ALLOWANCE.CROUS])).min(1),
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

    const audit: AuditContext = {
      requestId: crypto.randomUUID(),
      franceConnected: true,
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    };

    // Mode "identité pivot": API Particulier is called with the static API key + the
    // FranceConnect pivot identity as params (not the FC access token, whose modality
    // is buggy). Restrained to the resources implied by the selected aides.
    const apiParticulier = await callApiParticulierIdentite(pocResult.identity, audit, aides);

    const updated = await updatePocSession({ apiParticulier, residenceInsee, aides });
    if (!updated) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
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
