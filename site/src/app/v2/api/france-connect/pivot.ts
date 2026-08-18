import { FranceConnectIdentity } from '@/app/services/france-connect';
import { PivotIdentity } from '@/app/services/queue';

// FranceConnect /userinfo -> worker PivotIdentity. gender is a free string on the
// FC side (OIDC "male"/"female"); narrow it to the worker's union. Values are passed
// through untouched otherwise: they come from état civil inside a signed JWT.
export const toPivotIdentity = (identity: FranceConnectIdentity): PivotIdentity | null => {
  if (!identity.family_name) {
    return null;
  }
  const gender =
    identity.gender === 'female' ? 'female' : identity.gender === 'male' ? 'male' : undefined;
  return {
    sub: identity.sub,
    family_name: identity.family_name,
    preferred_username: identity.preferred_username,
    given_name: identity.given_name,
    birthdate: identity.birthdate,
    gender,
    birthplace: identity.birthplace,
    birthcountry: identity.birthcountry,
    email: identity.email,
  };
};
