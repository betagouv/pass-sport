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

// Routes where the pass Sport beneficiary is a child of the allocataire. On every other
// route the allocataire IS the beneficiary.
const CHILD_AIDES: Situation[] = [SITUATION.QF, SITUATION.AEEH];

export const isChildAide = (aide: Situation): boolean => CHILD_AIDES.includes(aide);

// Boursiers have no allocataire at all: the organisme is always the CNOUS, and the
// recipient* fields of the form describe the student themselves.
const BOURSIER_AIDES: Situation[] = [SITUATION.CROUS, SITUATION.FSS];

export const isBoursierAide = (aide: Situation): boolean => BOURSIER_AIDES.includes(aide);

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

export type ApiParticulierJobData = {
  aide: Situation;
  caisse: CAISSE | null;
  beneficiary: { lastname: string; firstname: string; birthdate: string };
  allocataire: PivotIdentity;
  // LCA wants the pays de naissance as ISO 3166-1 alpha-2 where API Particulier wants the
  // COG carried by allocataire.birthcountry. Only this side holds the conversion table.
  birthCountryIso?: string;
  cafNumber?: string;
  ine?: string;
  residenceInsee: string;
  email: string;
  clientIp?: string | null;
  userAgent?: string | null;
};

const beneficiaryPivotIdentity = (data: ApiParticulierJobData): PivotIdentity => ({
  family_name: data.beneficiary.lastname,
  given_name: data.beneficiary.firstname,
  birthdate: data.beneficiary.birthdate,
  gender: data.allocataire.gender,
  birthplace: data.allocataire.birthplace,
  birthcountry: data.allocataire.birthcountry,
});

// Fixed order, so the digest of a given identity never depends on how the object was built.
const PIVOT_HASH_FIELDS = [
  'family_name',
  'given_name',
  'birthdate',
  'gender',
  'birthplace',
  'birthcountry',
] as const satisfies readonly (keyof PivotIdentity)[];

// Whose pivot identity the job is keyed on: the child on the household routes, the
// allocataire on the ones where they are the beneficiary.
const pivotIdentityParts = (data: ApiParticulierJobData): (string | undefined)[] => {
  const identity = isChildAide(data.aide) ? beneficiaryPivotIdentity(data) : data.allocataire;
  return PIVOT_HASH_FIELDS.map((field) => identity[field]);
};

// Stands in for the FranceConnect `sub`: stable across resubmissions of the same request,
// and not reversible into a name and a birthdate, since it ends up as a Redis key. The
// aide is part of it so someone refused on one route can still try another.
export const apiParticulierJobId = (data: ApiParticulierJobData): string =>
  createHash('sha256')
    .update(
      [data.aide, ...pivotIdentityParts(data)]
        .map((part) => (part ?? '').trim().toLowerCase())
        .join('|'),
    )
    .digest('hex')
    .slice(0, 32);
