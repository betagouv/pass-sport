import { createHash } from 'crypto';
import { CAISSE } from '@/utils/eligibility-test';

export type PivotIdentity = {
  sub?: string;
  family_name: string;
  preferred_username?: string;
  given_name?: string;
  birthdate?: string; // ISO "YYYY-MM-DD"
  gender?: 'male' | 'female';
  birthplace?: string; // code COG INSEE commune de naissance
  birthcountry?: string; // code COG INSEE pays de naissance
  email?: string;
};

// 'QF' is the "quotient familial < 700" route, which makes the household's 6-17 ans eligible.
export const ALLOWANCE = {
  AAH: 'AAH',
  CROUS: 'CROUS',
  AEEH: 'AEEH',
  QF: 'QF',
} as const;

export type Allowance = (typeof ALLOWANCE)[keyof typeof ALLOWANCE];

// 'FSS' (bourse régionale des formations sanitaires et sociales) is an LCA situation with
// no API Particulier counterpart.
export const SITUATION = { ...ALLOWANCE, FSS: 'FSS' } as const;

export type Situation = (typeof SITUATION)[keyof typeof SITUATION];

// What BullMQ stores verbatim. The worker adds a `checkpoint` field at runtime to resume a
// rate-limited job — producers never send it.
export type EligibilityJobData = {
  identity: PivotIdentity;
  aides: Allowance[];
  isFranceConnected: boolean;
  residenceInsee: string;
  // Originating client IP (right-most x-forwarded-for hop), recorded by the worker
  // in the audit table. null when the request carried no forwarded-for header.
  clientIp?: string | null;
  // Client User-Agent header, recorded by the worker in the audit table.
  userAgent?: string | null;
};

// One event to replay into eligibility_history. The site performs the LCA calls now, so it
// is the only place that ever sees the raw answers; the worker just writes them down.
export type LcaHistoryEvent = {
  action: string;
  status: 'success' | 'not_found' | 'error';
  durationMs: number;
  error?: string;
  bodyPayload?: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
};

/**
 * What the verdict route hands the worker once the browser already has its answer. It
 * carries the outcome, never the inputs needed to reproduce it: the LCA calls are done.
 */
export type LcaJobData = {
  aide: Situation;
  caisse: CAISSE | null;
  beneficiary: { lastname: string; firstname: string; birthdate: string };
  allocataire: { family_name?: string; given_name?: string };
  residenceInsee: string;
  lcaStatus: 'confirmed' | 'not_found' | 'error';
  passSportCode: string | null;
  // Typed by the usager at the end of step two, and the only address the outcome is ever
  // mailed to. Always present.
  contactEmail: string;
  // Read off the LCA /confirm answer (allocataire.courriel). Never written to; it is compared
  // against contactEmail to decide whether the code may be mailed. Null when LCA held none.
  email: string | null;
  history: LcaHistoryEvent[];
  clientIp?: string | null;
  userAgent?: string | null;
};

// Fixed order, so the digest of a given beneficiary never depends on how the object was built.
const BENEFICIARY_HASH_FIELDS = ['lastname', 'firstname', 'birthdate'] as const;

// Stands in for the FranceConnect `sub`: stable across resubmissions of the same request,
// and not reversible into a name and a birthdate, since it ends up as a Redis key. The aide
// is part of it so someone refused on one route can still try another. Keyed on the
// beneficiary — the person the code is for — on every route, the way LCA /search is.
//
// contactEmail is part of it too: a usager who mistyped their address gets nothing but the
// failure mail, and a resubmission under the same id would be swallowed by the worker's
// "already recorded and mailed" guard. A corrected address is a different request.
export const lcaJobId = (data: LcaJobData): string =>
  createHash('sha256')
    .update(
      [
        data.aide,
        ...BENEFICIARY_HASH_FIELDS.map((field) => data.beneficiary[field]),
        data.contactEmail,
      ]
        .map((part) => (part ?? '').trim().toLowerCase())
        .join('|'),
    )
    .digest('hex')
    .slice(0, 32);
