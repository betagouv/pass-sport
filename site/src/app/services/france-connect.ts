// FranceConnect OpenID Connect helpers.
// Implements the authorization-code flow by hand (no full oidc client lib in the repo).
// id_token and userinfo JWTs are signed by FranceConnect with ES256 and verified here
// against the provider JWKS (issuer + audience + nonce checks included).

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

// FranceConnect v2 signs id_token / userinfo with ES256 (ECDSA P-256 + SHA-256).
const FC_SIGNING_ALG = 'ES256';

export interface FranceConnectConfig {
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  endSessionEndpoint: string;
  jwksEndpoint: string;
  scopes: string;
}

export interface FranceConnectTokens {
  accessToken: string;
  idToken: string;
}

// FranceConnect identity pivot returned by /userinfo.
export interface FranceConnectIdentity {
  sub: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  birthdate?: string;
  gender?: string;
  birthplace?: string;
  birthcountry?: string;
  email?: string;
}

const DEFAULT_BASE_URL = 'https://fcp-low.sbx.dev-franceconnect.fr/api/v2';
// Besides the identity scopes, the FranceConnect-token mode of API Particulier
// requires the token to carry the business scopes of each called endpoint
// (apistration commons/data/authorizations.yml) — otherwise the API answers 401:
// - quotient familial: cnaf_quotient_familial
// - AAH: allocation_adulte_handicape
// - AEEH: cnav_allocation_enfant_handicape
// - ARS: cnav_allocation_rentree_scolaire
// - étudiant boursier: cnous_*
const DEFAULT_SCOPES = [
  'openid identite_pivot preferred_username email',
  'cnaf_quotient_familial',
  'allocation_adulte_handicape',
  'cnav_allocation_enfant_handicape',
  'cnav_allocation_rentree_scolaire',
  'cnous_statut_boursier cnous_echelon_bourse cnous_email cnous_periode_versement cnous_statut_bourse cnous_ville_etudes cnous_identite',
].join(' ');

export const getFranceConnectConfig = (): FranceConnectConfig => {
  const clientId = process.env.FRANCE_CONNECT_CLIENT_ID;
  const clientSecret = process.env.FRANCE_CONNECT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FranceConnect credentials are missing (FRANCE_CONNECT_CLIENT_ID / _SECRET)');
  }

  const baseUrl = process.env.FRANCE_CONNECT_BASE_URL ?? DEFAULT_BASE_URL;

  return {
    clientId,
    clientSecret,
    // FranceConnect v2 issuer is the API base URL; override only if the provider differs.
    issuer: process.env.FRANCE_CONNECT_ISSUER ?? baseUrl,
    authorizationEndpoint:
      process.env.FRANCE_CONNECT_AUTHORIZATION_ENDPOINT ?? `${baseUrl}/authorize`,
    tokenEndpoint: process.env.FRANCE_CONNECT_TOKEN_ENDPOINT ?? `${baseUrl}/token`,
    userInfoEndpoint: process.env.FRANCE_CONNECT_USERINFO_ENDPOINT ?? `${baseUrl}/userinfo`,
    endSessionEndpoint: process.env.FRANCE_CONNECT_END_SESSION_ENDPOINT ?? `${baseUrl}/session/end`,
    jwksEndpoint: process.env.FRANCE_CONNECT_JWKS_ENDPOINT ?? `${baseUrl}/jwks`,
    scopes: process.env.FRANCE_CONNECT_SCOPES ?? DEFAULT_SCOPES,
  };
};

// Remote JWKS sets, cached per endpoint. jose handles key caching + rotation
// (re-fetch on unknown kid) internally behind this function.
const jwksByEndpoint = new Map<string, JWTVerifyGetKey>();

const getJwks = (jwksEndpoint: string): JWTVerifyGetKey => {
  let jwks = jwksByEndpoint.get(jwksEndpoint);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksEndpoint));
    jwksByEndpoint.set(jwksEndpoint, jwks);
  }
  return jwks;
};

export const buildAuthorizeUrl = (params: {
  config: FranceConnectConfig;
  redirectUri: string;
  state: string;
  nonce: string;
}): URL => {
  const { config, redirectUri, state, nonce } = params;

  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('acr_values', 'eidas1');

  return url;
};

export const exchangeCodeForTokens = async (params: {
  config: FranceConnectConfig;
  code: string;
  redirectUri: string;
}): Promise<FranceConnectTokens> => {
  const { config, code, redirectUri } = params;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`FranceConnect token exchange failed. Status: ${response.status}`);
  }

  const json = (await response.json()) as { access_token?: string; id_token?: string };

  if (!json.access_token || !json.id_token) {
    throw new Error('FranceConnect token response is missing access_token or id_token');
  }

  return { accessToken: json.access_token, idToken: json.id_token };
};

// Verifies the id_token ES256 signature against the FranceConnect JWKS and asserts
// issuer, audience (client_id) and the nonce bound to this authorization request.
// Throws if any check fails. Returns the verified claims.
export const verifyIdToken = async (params: {
  config: FranceConnectConfig;
  idToken: string;
  nonce: string;
}): Promise<JWTPayload> => {
  const { config, idToken, nonce } = params;

  const { payload } = await jwtVerify(idToken, getJwks(config.jwksEndpoint), {
    algorithms: [FC_SIGNING_ALG],
    issuer: config.issuer,
    audience: config.clientId,
  });

  if (payload.nonce !== nonce) {
    throw new Error('FranceConnect id_token nonce mismatch');
  }

  return payload;
};

export const fetchUserInfo = async (params: {
  config: FranceConnectConfig;
  accessToken: string;
}): Promise<FranceConnectIdentity> => {
  const { config, accessToken } = params;

  const response = await fetch(config.userInfoEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`FranceConnect userinfo request failed. Status: ${response.status}`);
  }

  // FranceConnect v2 returns userinfo as a signed JWT (application/jwt).
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/jwt')) {
    const jwt = await response.text();
    const { payload } = await jwtVerify(jwt, getJwks(config.jwksEndpoint), {
      algorithms: [FC_SIGNING_ALG],
      issuer: config.issuer,
      audience: config.clientId,
    });
    return payload as unknown as FranceConnectIdentity;
  }

  return (await response.json()) as FranceConnectIdentity;
};

export const buildLogoutUrl = (params: {
  config: FranceConnectConfig;
  idToken: string;
  postLogoutRedirectUri: string;
  state: string;
}): URL => {
  const { config, idToken, postLogoutRedirectUri, state } = params;

  const url = new URL(config.endSessionEndpoint);
  url.searchParams.set('id_token_hint', idToken);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
  url.searchParams.set('state', state);

  return url;
};
