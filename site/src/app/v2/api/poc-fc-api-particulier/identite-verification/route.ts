// No-FranceConnect journey, LCA-no-match fallback: verifies the typed pivot
// identity against the API Particulier "identité" endpoint matching the
// allowance selected in the eligibility test, and answers eligible / not.
//
// No session involved: this journey never touches FranceConnect. The identity
// is user-typed (not verified) — the audit rows carry franceConnected: false.
//
// Response (200): { eligible: boolean, verified: boolean }
// - verified: false only for ARS, which API Particulier cannot verify — the
//   verdict is then presumed on age alone (12-17 ans révolus).

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import {
  callApiParticulierAllowanceIdentite,
  VerifiableAllowance,
} from '@/app/services/api-particulier';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { AuditContext } from '@/app/services/audit';
import { ageAtReferenceDate } from '@/app/services/lca-bridge';
import { getClientIp } from '@/utils/client-ip';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import {
  AllocationEnfantHandicapeData,
  EtudiantBoursierData,
  StatutBeneficiaireData,
} from 'types/ApiParticulier';

// COG INSEE code for France, expected by API Particulier as birth country.
const COG_FRANCE = '99100';

const schema = z.object({
  allowance: z.enum([ALLOWANCE.ARS, ALLOWANCE.AAH, ALLOWANCE.AEEH, ALLOWANCE.CROUS]),
  lastname: z.string().trim().min(1).max(100),
  firstname: z.string().trim().min(1).max(100),
  gender: z.enum(['M', 'F']),
  // YYYY-MM-DD (native date input format).
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // INSEE commune code: 5 chars, digits except Corsica (2A/2B).
  birthplaceInsee: z.string().regex(/^\d[\dAB]\d{3}$/),
});

// Eligibility rules per allowance (ages at AGE_REFERENCE_DATE), applied to the
// API Particulier response data.
const isEligibleFor = (allowance: VerifiableAllowance, age: number, data: unknown): boolean => {
  switch (allowance) {
    case ALLOWANCE.AAH:
      return ((data as StatutBeneficiaireData).est_beneficiaire && age >= 16 && age <= 30) === true;
    case ALLOWANCE.AEEH:
      return (
        ['allocataire', 'ouvrant_droit'].includes((data as AllocationEnfantHandicapeData).status) &&
        age >= 6 &&
        age <= 19
      );
    case ALLOWANCE.CROUS:
      return ((data as EtudiantBoursierData).est_boursier && age < 28) === true;
  }
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.parse(await request.json());
    const age = ageAtReferenceDate(body.birthdate);

    // ARS is not exposed by API Particulier: presume on age alone, flagged as
    // unverified so the client can nuance the message.
    if (body.allowance === ALLOWANCE.ARS) {
      return NextResponse.json({ eligible: age >= 12 && age <= 17, verified: false });
    }

    // Same shape as the FranceConnect pivot identity so the API Particulier
    // params mapping is shared. Only people born in France are supported (the
    // client short-circuits "né(e) à l'étranger" to the contact form).
    const identity: FranceConnectIdentity = {
      sub: 'poc-identite-verification',
      family_name: body.lastname,
      given_name: body.firstname,
      gender: body.gender === 'F' ? 'female' : 'male',
      birthdate: body.birthdate,
      birthplace: body.birthplaceInsee,
      birthcountry: COG_FRANCE,
    };

    const audit: AuditContext = {
      requestId: crypto.randomUUID(),
      // Identity is user-typed, NOT FranceConnect-verified.
      franceConnected: false,
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    };

    const result = await callApiParticulierAllowanceIdentite(body.allowance, identity, audit);

    if (!result.success) {
      // 404 = person or right not found -> a definite "not eligible" answer.
      if (result.httpStatus === 404) {
        return NextResponse.json({ eligible: false, verified: true });
      }
      // Rate-limited, provider errors...: no verdict possible.
      return NextResponse.json(
        { error: result.error ?? 'Vérification momentanément indisponible.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      eligible: isEligibleFor(body.allowance, age, result.data),
      verified: true,
    });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('POC identite-verification step failed');
      scope.captureException(e);
    });
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
