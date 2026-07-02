// POC mode 1 fallback: when the user cannot use FranceConnect, the pivot
// identity is typed in a form and API Particulier is called in "identité" mode
// (static token + identity params) via callApiParticulier.
//
// The result is stored in the same cookie as the FranceConnect flow, so the rest
// of the journey (LCA search / confirm, eligibility summary) is identical.
//
// Limitation: only people born in France are supported (the commune of birth is
// picked via CityFinder → code COG INSEE, and birthcountry is forced to France).
// People born abroad are directed to the contact form by the client.

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { callApiParticulier } from '@/app/services/api-particulier';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { AuditContext } from '@/app/services/audit';
import { getClientIp } from '@/utils/client-ip';
import { PocResult } from '@/app/v2/api/poc-fc-api-particulier/shared';
import { storePocResult } from '@/app/v2/api/poc-fc-api-particulier/session';

// COG INSEE code for France, expected by API Particulier as birth country.
const COG_FRANCE = '99100';

const schema = z.object({
  lastname: z.string().trim().min(1).max(100),
  firstnames: z.string().trim().min(1).max(100),
  gender: z.enum(['M', 'F']),
  // YYYY-MM-DD (native date input format).
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // INSEE commune codes: 5 chars, digits except Corsica (2A/2B).
  birthplaceInsee: z.string().regex(/^\d[\dAB]\d{3}$/),
  residenceInsee: z.string().regex(/^\d[\dAB]\d{3}$/),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.parse(await request.json());

    // Same shape as the FranceConnect pivot identity so the whole downstream
    // pipeline (API Particulier params, LCA payloads) is shared.
    const identity: FranceConnectIdentity = {
      sub: 'formulaire',
      family_name: body.lastname,
      given_name: body.firstnames,
      gender: body.gender === 'F' ? 'female' : 'male',
      birthdate: body.birthdate,
      birthplace: body.birthplaceInsee,
      birthcountry: COG_FRANCE,
    };

    const audit: AuditContext = {
      requestId: crypto.randomUUID(),
      // Mode 1: identity is user-typed, NOT FranceConnect-verified.
      franceConnected: false,
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
      recipientSiret: process.env.API_PARTICULIER_RECIPIENT_SIRET ?? null,
    };

    const apiParticulier = await callApiParticulier(identity, audit);

    const result: PocResult = {
      identity,
      apiParticulier,
      mode: 'formulaire',
      residenceInsee: body.residenceInsee,
    };

    // Personal data goes to the Redis session store; the browser only receives
    // the random session id (httpOnly cookie).
    await storePocResult(result);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC identite (mode 1) step failed');
      scope.captureException(e);
    });
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
