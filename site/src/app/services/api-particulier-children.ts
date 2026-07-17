// Pure decision layer for the per-child ARS/AEEH API Particulier checks: which
// quotient_familial children get which "identité" calls, and with which pivot
// identity. No I/O here — everything is unit-tested in api-particulier-children.spec.ts;
// the actual HTTP calls live in api-particulier.ts.

import type { FranceConnectIdentity } from '@/app/services/france-connect';
import type { PersonneQuotientFamilial } from '@/types/ApiParticulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { ALLOWANCE_MAPPING_TO_ALLOCATION, isEligible } from '@/utils/eligibility-test';

// QF dates come back as "AAAA-MM-JJ" or "JJ/MM/AAAA" depending on the provider
// (CAF/MSA) — normalize to ISO so splitBirthdate works (mirrors lca-bridge).
export const toIsoBirthdate = (date?: string): string | undefined => {
  if (!date) return undefined;
  const frMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  return undefined;
};

// A child pivot identity always carries a birthdate (it is required to build one).
export type ChildIdentity = FranceConnectIdentity & { birthdate: string };

// Synthetic pivot identity for a QF child, so the identité param builders can be
// reused. QF children carry no birth COG, yet codeCogInseePaysNaissance is required
// by the ARS/AEEH identité endpoints — the birth COG of the FranceConnected parent
// is used in its place.
export const enfantToIdentity = (
  enfant: PersonneQuotientFamilial,
  parent: FranceConnectIdentity,
): ChildIdentity | null => {
  const familyName = enfant.nom_naissance || enfant.nom_usage;
  const birthdate = toIsoBirthdate(enfant.date_naissance);
  if (!familyName || !enfant.prenoms || !birthdate) return null;

  return {
    sub: 'qf-enfant',
    family_name: familyName,
    preferred_username: enfant.nom_usage || undefined,
    given_name: enfant.prenoms,
    gender: enfant.sexe === 'F' ? 'female' : enfant.sexe === 'M' ? 'male' : undefined,
    birthdate,
    birthplace: parent.birthplace,
    birthcountry: parent.birthcountry,
  };
};

export type ChildAllowance = ALLOWANCE.ARS | ALLOWANCE.AEEH;
const CHILD_ALLOWANCES: ChildAllowance[] = [ALLOWANCE.ARS, ALLOWANCE.AEEH];

// The aides to verify for one child: those harvested AND whose pass Sport birthdate
// window (utils/eligibility-test.ts) contains the child's birthdate. A child born
// outside an aide's window can never be eligible, so its endpoint is not called.
export const childAllowancesToCheck = (
  birthdate: string,
  allowances: ALLOWANCE[],
): ChildAllowance[] =>
  CHILD_ALLOWANCES.filter(
    (allowance) =>
      allowances.includes(allowance) &&
      isEligible({
        targetDate: birthdate,
        allocationName: ALLOWANCE_MAPPING_TO_ALLOCATION[allowance],
      }),
  );

export interface ChildCheck {
  // Index into QuotientFamilialData.enfants the check belongs to.
  childIndex: number;
  identity: ChildIdentity;
  allowance: ChildAllowance;
}

// Full per-child call plan: one entry per (eligible child, harvested aide) pair.
// Children with an incomplete QF pivot or outside every window yield no entry.
export const planChildrenChecks = (
  enfants: PersonneQuotientFamilial[],
  parent: FranceConnectIdentity,
  allowances: ALLOWANCE[],
): ChildCheck[] =>
  enfants.flatMap((enfant, childIndex) => {
    const identity = enfantToIdentity(enfant, parent);
    if (!identity) return [];

    return childAllowancesToCheck(identity.birthdate, allowances).map((allowance) => ({
      childIndex,
      identity,
      allowance,
    }));
  });
