import { Client, ApiGouvError, Response as ApiResponse } from '@api-gouv-dinum/api-particulier';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { getRedis } from '@/app/services/redis';
import { acquireToken, RateLimitedError, RedisLike } from '@/app/services/rate-limiter';
import { AuditContext, writeAuditEvent } from '@/app/services/audit';
import {
  QuotientFamilialData,
  StatutBeneficiaireData,
  AllocationEnfantHandicapeData,
  EtudiantBoursierData,
} from '@/types/ApiParticulier';

type ApiParticulierData =
  | QuotientFamilialData
  | StatutBeneficiaireData
  | AllocationEnfantHandicapeData
  | EtudiantBoursierData;

export interface ApiParticulierResourceResult {
  resource: string;
  label: string;
  httpStatus: number | null;
  success: boolean;
  data: ApiParticulierData | null;
  error?: string;
}

export type ApiParticulierResults = ApiParticulierResourceResult[];

const getClientConfig = () => {
  const recipient = process.env.API_PARTICULIER_RECIPIENT_SIRET;
  if (!recipient) {
    throw new Error('API_PARTICULIER_RECIPIENT_SIRET is missing');
  }

  return {
    environment: (process.env.API_PARTICULIER_ENV === 'production' ? 'production' : 'staging') as
      | 'production'
      | 'staging',
    // recipient is also mandatory on FranceConnect-mode calls.
    defaultParams: { recipient },
  };
};

// Mode "identité pivot": static API Particulier token, identity passed as query params.
const getClient = (): Client => {
  const token = process.env.API_PARTICULIER_TOKEN;
  if (!token) {
    throw new Error('API_PARTICULIER_TOKEN is missing');
  }

  return new Client({ token, ...getClientConfig() });
};

// Mode "FranceConnecté": the FC access token replaces the static API key
// (Authorization: Bearer <fc_token>). API Particulier introspects it with
// FranceConnect and resolves the user's pivot identity itself — no identity
// params are sent.
const getFranceConnectClient = (fcAccessToken: string): Client =>
  new Client({ token: fcAccessToken, ...getClientConfig() });

// FranceConnect "male"/"female" -> API Particulier "M"/"F".
const mapGender = (gender?: string): string | undefined => {
  if (gender === 'male') return 'M';
  if (gender === 'female') return 'F';
  return undefined;
};

const splitBirthdate = (birthdate?: string) => {
  const [year, month, day] = (birthdate ?? '').split('-');
  return {
    annee_date_naissance: year || undefined,
    mois_date_naissance: month || undefined,
    jour_date_naissance: day || undefined,
  };
};

const splitPrenoms = (givenName?: string): string[] | undefined =>
  givenName ? givenName.split(' ').filter(Boolean) : undefined;

// DSS "_identite" params (AAH, AEEH, quotient familial).
const toDssParams = (identity: FranceConnectIdentity) => ({
  nom_naissance: identity.family_name,
  prenoms: splitPrenoms(identity.given_name),
  ...splitBirthdate(identity.birthdate),
  sexe_etat_civil: mapGender(identity.gender),
  code_cog_insee_commune_naissance: identity.birthplace || undefined,
  code_cog_insee_pays_naissance: identity.birthcountry || undefined,
});

// CNOUS "_identite" params (no pays code).
const toCnousParams = (identity: FranceConnectIdentity) => ({
  nom_naissance: identity.family_name,
  prenoms: splitPrenoms(identity.given_name),
  ...splitBirthdate(identity.birthdate),
  sexe_etat_civil: mapGender(identity.gender),
  code_cog_insee_commune_naissance: identity.birthplace || undefined,
});

// Wraps one SDK call: acquires a rate-limit token first, then normalizes success,
// ApiGouvError, and RateLimitedError into a result row. Each outcome is written to the
// audit trail (metadata only — never the returned data).
interface CallResourceArgs {
  redis: RedisLike;
  audit: AuditContext;
  resource: string;
  label: string;
  call: () => Promise<ApiResponse>;
}

const callResource = async ({
  redis,
  audit,
  resource,
  label,
  call,
}: CallResourceArgs): Promise<ApiParticulierResourceResult> => {
  const start = Date.now();
  try {
    await acquireToken(redis);

    const response = await call();

    await writeAuditEvent(audit, {
      resource,
      httpStatus: response.httpStatus,
      success: response.success,
      durationMs: Date.now() - start,
    });

    return {
      resource,
      label,
      httpStatus: response.httpStatus,
      success: response.success,
      data: response.data as ApiParticulierData,
    };
  } catch (e) {
    if (e instanceof RateLimitedError) {
      await writeAuditEvent(audit, {
        resource,
        httpStatus: null,
        success: false,
        errorCode: 'rate_limited',
        durationMs: Date.now() - start,
      });

      return {
        resource,
        label,
        httpStatus: null,
        success: false,
        data: null,
        error: 'Service momentanément saturé, veuillez réessayer.',
      };
    }

    if (e instanceof ApiGouvError) {
      await writeAuditEvent(audit, {
        resource,
        httpStatus: e.httpStatus,
        success: false,
        errorCode: `http_${e.httpStatus}`,
        durationMs: Date.now() - start,
      });

      return {
        resource,
        label,
        httpStatus: e.httpStatus,
        success: false,
        data: null,
        error: e.firstErrorDetail ?? e.firstErrorTitle ?? e.message,
      };
    }
    await writeAuditEvent(audit, {
      resource,
      httpStatus: null,
      success: false,
      errorCode: 'unexpected',
      durationMs: Date.now() - start,
    });
    throw e;
  }
};

// Mode "FranceConnecté" (mode 2): authenticates each call with the FranceConnect
// access token obtained during the OIDC callback. Must be called while that token
// is still valid — i.e. within the callback flow, before any long-lived processing.
// The pivot identity fetched from /userinfo stays available for downstream LCA
// calls (fetchEligible / fetchCode); it is simply not sent to API Particulier.
export const callApiParticulierFranceConnect = async (
  fcAccessToken: string,
  audit: AuditContext,
): Promise<ApiParticulierResults> => {
  const client = getFranceConnectClient(fcAccessToken);
  const redis = await getRedis();

  return Promise.all([
    callResource({
      redis,
      audit,
      resource: 'dss.quotient_familial_france_connect',
      label: 'Quotient familial CAF/MSA',
      call: () => client.dss.quotient_familial(),
    }),
    callResource({
      redis,
      audit,
      resource: 'dss.allocation_adulte_handicape_france_connect',
      label: 'Allocation adulte handicapé (AAH)',
      call: () => client.dss.allocation_adulte_handicape(),
    }),
    callResource({
      redis,
      audit,
      resource: 'dss.allocation_enfant_handicape_france_connect',
      label: "Allocation d'éducation de l'enfant handicapé (AEEH)",
      call: () => client.dss.allocation_enfant_handicape(),
    }),
    callResource({
      redis,
      audit,
      resource: 'cnous.etudiant_boursier_france_connect',
      label: 'Statut étudiant boursier',
      call: () => client.cnous.etudiant_boursier(),
    }),
  ]);
};

// Mode "identité pivot" (mode 1): static token, FC identity replayed as query params.
// Kept as a fallback — unlike mode 2 it works outside the FC session lifetime.
export const callApiParticulier = async (
  identity: FranceConnectIdentity,
  audit: AuditContext,
): Promise<ApiParticulierResults> => {
  const client = getClient();
  const redis = await getRedis();
  const dssParams = toDssParams(identity);

  return Promise.all([
    callResource({
      redis,
      audit,
      resource: 'dss.quotient_familial_identite',
      label: 'Quotient familial CAF/MSA',
      call: () => client.dss.quotient_familial_identite(dssParams),
    }),
    callResource({
      redis,
      audit,
      resource: 'dss.allocation_adulte_handicape_identite',
      label: 'Allocation adulte handicapé (AAH)',
      call: () => client.dss.allocation_adulte_handicape_identite(dssParams),
    }),
    callResource({
      redis,
      audit,
      resource: 'dss.allocation_enfant_handicape_identite',
      label: "Allocation d'éducation de l'enfant handicapé (AEEH)",
      call: () => client.dss.allocation_enfant_handicape_identite(dssParams),
    }),
    callResource({
      redis,
      audit,
      resource: 'cnous.etudiant_boursier_identite',
      label: 'Statut étudiant boursier',
      call: () => client.cnous.etudiant_boursier_identite(toCnousParams(identity)),
    }),
  ]);
};
