import { CORSE_CODE_ACTUEL } from "./cog-corse";
import { FRANCE_COG_INSEE, type PivotIdentity, type ResourceResult } from "./types";

// FranceConnect serves the commune code in force at birth (RNIPP). Two such codes cost answers on
// API Particulier, as measured on the FC chain in November 2026:
//   - Corsica before 1976 (20xxx): refused outright (422), never once answered → rewritten
//     before the call;
//   - Mayotte before 2011 (985xx): mostly answered, a few more 404 than expected → current code
//     (976xx) asked only after a 404 / 422.
// Former codes of merged communes are answered as well as current ones: left untouched.

export type BirthplaceRule = "corse_1976" | "mayotte_2011";

const MAYOTTE_ANCIEN = /^985(\d{2})$/;

const bornInFrance = (identity: PivotIdentity): boolean =>
  !!identity.birthplace && (!identity.birthcountry || identity.birthcountry === FRANCE_COG_INSEE);

const withBirthplace = (identity: PivotIdentity, birthplace: string): PivotIdentity => ({
  ...identity,
  birthplace,
});

export const currentCorsicanBirthplace = (identity: PivotIdentity): PivotIdentity => {
  const current = bornInFrance(identity) ? CORSE_CODE_ACTUEL[identity.birthplace!] : undefined;
  return current ? withBirthplace(identity, current) : identity;
};

export const mayotteFallback = (identity: PivotIdentity): PivotIdentity | null => {
  const match = bornInFrance(identity) ? MAYOTTE_ANCIEN.exec(identity.birthplace!) : null;
  return match ? withBirthplace(identity, `976${match[1]}`) : null;
};

export const needsBirthplaceFallback = (row: ResourceResult | undefined): boolean =>
  row?.httpStatus === 404 || row?.httpStatus === 422;

// Kept on the history row, so the code sent can be told from the one FranceConnect served.
export const birthplaceAnnotation = (
  fc: PivotIdentity,
  sent: PivotIdentity,
  rule: BirthplaceRule,
): Record<string, unknown> | undefined =>
  fc.birthplace === sent.birthplace
    ? undefined
    : { birthplace_fallback: { rule, code_fc: fc.birthplace, code_envoye: sent.birthplace } };
