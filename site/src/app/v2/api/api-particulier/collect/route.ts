import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { zfd } from 'zod-form-data';
import {
  SITUATION,
  type ApiParticulierJobData,
  type PivotIdentity,
  type Situation,
  enqueueEmailVerificationJob,
  findApiParticulierJob,
} from '@/app/services/queue';
import { apiParticulierJobId, isBoursierAide } from '@/app/services/eligibility-job';
import { findResultForJobId } from '@/app/services/applications';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { CAISSE } from '@/utils/eligibility-test';
import { countries } from '@/app/v2/test-eligibilite/helpers/countries';
import { handleSupportCookie } from '@/utils/cookie';
import { getClientIp } from '@/utils/client-ip';

const schema = zfd.formData({
  beneficiaryLastname: z.string().min(1),
  beneficiaryFirstname: z.string().min(1),
  beneficiaryBirthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // INSEE commune code: 5 chars, digits except Corsica (2A/2B).
  recipientResidencePlace: z.string().regex(/^\d[\dAB]\d{3}$/),

  allowanceName: z.nativeEnum(ALLOWANCE),
  caisse: z.nativeEnum(CAISSE).optional(),

  // Optional here rather than in the form: which of these the usager was shown depends on
  // the branch, and a wrong `required` would 400 a valid submission.
  recipientLastname: z.string().optional(),
  recipientFirstname: z.string().optional(),
  recipientGenre: z.enum(['F', 'M']).optional(),
  recipientBirthDate: z.string().optional(),
  recipientBirthCountry: z.string().optional(),
  recipientBirthPlace: z.string().optional(),
  recipientCafNumber: z.string().optional(),
  recipientIneNumber: z.string().optional(),

  email: z.string().email(),
});

type FormPayload = z.infer<typeof schema>;

const SITUATION_BY_ALLOWANCE: Partial<Record<ALLOWANCE, Situation>> = {
  [ALLOWANCE.QF]: SITUATION.QF,
  [ALLOWANCE.AEEH]: SITUATION.AEEH,
  [ALLOWANCE.AAH]: SITUATION.AAH,
  [ALLOWANCE.CROUS]: SITUATION.CROUS,
  [ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX]: SITUATION.FSS,
};

// The country <select> emits an ISO 3166-1 alpha-2 code, which is what LCA's codeIso wants;
// API Particulier wants the COG.
const cogForIso = (iso?: string): string | undefined =>
  iso ? countries.find((c) => c.isoCode === iso)?.cog : undefined;

const trimmed = (value?: string): string | undefined => {
  const v = value?.trim();
  return v ? v : undefined;
};

// On the boursier routes the beneficiary IS the allocataire, and the form's genre and lieu
// de naissance fields describe them, so their own names are used.
const toAllocataireIdentity = (form: FormPayload, isBoursier: boolean): PivotIdentity => {
  const lastname = isBoursier ? form.beneficiaryLastname : form.recipientLastname;
  const firstname = isBoursier ? form.beneficiaryFirstname : form.recipientFirstname;

  return {
    family_name: (trimmed(lastname) ?? form.beneficiaryLastname).trim(),
    given_name: trimmed(firstname) ?? form.beneficiaryFirstname.trim(),
    birthdate: isBoursier ? form.beneficiaryBirthDate : trimmed(form.recipientBirthDate),
    gender:
      form.recipientGenre === 'F' ? 'female' : form.recipientGenre === 'M' ? 'male' : undefined,
    birthplace: trimmed(form.recipientBirthPlace),
    birthcountry: cogForIso(trimmed(form.recipientBirthCountry)),
    email: form.email,
  };
};

export async function POST(request: Request): Promise<Response> {
  try {
    const form = schema.parse(await request.formData());

    const aide = SITUATION_BY_ALLOWANCE[form.allowanceName];
    // ALLOWANCE.NONE, for which the form is never rendered.
    if (!aide) {
      return NextResponse.json({ error: 'Situation invalide.' }, { status: 400 });
    }

    const isBoursier = isBoursierAide(aide);

    const data: ApiParticulierJobData = {
      aide,
      caisse: isBoursier ? null : (form.caisse ?? null),
      beneficiary: {
        lastname: form.beneficiaryLastname.trim(),
        firstname: form.beneficiaryFirstname.trim(),
        birthdate: form.beneficiaryBirthDate,
      },
      allocataire: toAllocataireIdentity(form, isBoursier),
      birthCountryIso: trimmed(form.recipientBirthCountry),
      cafNumber: trimmed(form.recipientCafNumber),
      ine: trimmed(form.recipientIneNumber),
      residenceInsee: form.recipientResidencePlace,
      email: form.email.trim(),
      clientIp: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    };

    // Written at submit rather than on a no-match, which is a verdict this route no longer
    // sees, so the contact form still carries what the usager entered.
    await handleSupportCookie(
      {
        beneficiaryLastname: data.beneficiary.lastname,
        beneficiaryFirstname: data.beneficiary.firstname,
        beneficiaryBirthDate: data.beneficiary.birthdate,
        recipientResidencePlace: data.residenceInsee,
        allowanceName: form.allowanceName,
        isFromCrous: isBoursier,
      },
      'search',
    );

    const jobId = apiParticulierJobId(data);
    const existing = await findApiParticulierJob(jobId);

    if (existing) {
      // Only a request already PROCESSED has a mailbox to name; one still in flight has
      // sent nothing yet. The address comes back masked from the view — the raw column is
      // not granted to this role.
      const processed = existing.state === 'processed' ? await findResultForJobId(jobId) : null;

      return NextResponse.json(
        { queued: false, alreadyQueued: true, state: existing.state, sentTo: processed?.emailMask },
        { status: 409 },
      );
    }

    // The identity here is DECLARED, not FranceConnected: nothing is enqueued against API
    // Particulier until the address that claimed it is confirmed.
    await enqueueEmailVerificationJob(data);

    return NextResponse.json({ queued: true, pendingVerification: true }, { status: 202 });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    // Also on stdout: Sentry is inert without a DSN, so without this a local 500 says
    // nothing at all.
    console.error(`[pass-sport] combined form submission failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('component', 'queue');
      scope.setTag('app', 'site');
      scope.captureMessage('Combined form enqueue failed');
      scope.captureException(e);
    });

    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
