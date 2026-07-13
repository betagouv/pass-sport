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
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

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

// Mode "identité pivot" (used by the FranceConnect journey): FranceConnect only
// authenticates the user and yields the pivot identity (/userinfo); API Particulier
// is then called with the static API key + that identity as query params. Avoids the
// buggy FC-token modality. The pivot identity also stays available for downstream LCA
// calls (fetchEligible / fetchCode).
// The 4 API Particulier resources, keyed. Order here is the output order.
type ResourceKey = 'qf' | 'aah' | 'aeeh' | 'crous';
const RESOURCE_ORDER: ResourceKey[] = ['qf', 'aah', 'aeeh', 'crous'];

// Which resources each harvested aide requires. quotient_familial is pulled for
// ARS/AEEH (allocataire + enfants), never for AAH-only / CROUS-only.
const ALLOWANCE_RESOURCES: Record<ALLOWANCE, ResourceKey[]> = {
  [ALLOWANCE.AAH]: ['aah'],
  [ALLOWANCE.AEEH]: ['qf', 'aeeh'],
  [ALLOWANCE.ARS]: ['qf'],
  [ALLOWANCE.CROUS]: ['crous'],
  [ALLOWANCE.FORMATIONS_SANITAIRES_SOCIAUX]: ['crous'],
  [ALLOWANCE.NONE]: [],
};

export const callApiParticulierIdentite = async (
  identity: FranceConnectIdentity,
  audit: AuditContext,
  allowances: ALLOWANCE[] = [],
): Promise<ApiParticulierResults> => {
  const client = getClient();
  const redis = await getRedis();
  const dssParams = toDssParams(identity);
  const cnousParams = toCnousParams(identity);

  // Restrain to the resources implied by the harvested aides. Empty selection
  // (defensive — the gate blocks it) falls back to all resources.
  const wanted = new Set<ResourceKey>(allowances.flatMap((a) => ALLOWANCE_RESOURCES[a] ?? []));
  const keys = wanted.size ? RESOURCE_ORDER.filter((k) => wanted.has(k)) : RESOURCE_ORDER;

  const resourceCalls: Record<ResourceKey, () => Promise<ApiParticulierResourceResult>> = {
    qf: () =>
      callResource({
        redis,
        audit,
        resource: 'dss.quotient_familial_identite',
        label: 'Quotient familial CAF/MSA',
        call: () => client.dss.quotient_familial_identite(dssParams),
      }),
    aah: () =>
      callResource({
        redis,
        audit,
        resource: 'dss.allocation_adulte_handicape_identite',
        label: 'Allocation adulte handicapé (AAH)',
        call: () => client.dss.allocation_adulte_handicape_identite(dssParams),
      }),
    aeeh: () =>
      callResource({
        redis,
        audit,
        resource: 'dss.allocation_enfant_handicape_identite',
        label: "Allocation d'éducation de l'enfant handicapé (AEEH)",
        call: () => client.dss.allocation_enfant_handicape_identite(dssParams),
      }),
    crous: () =>
      callResource({
        redis,
        audit,
        resource: 'cnous.etudiant_boursier_identite',
        label: 'Statut étudiant boursier',
        call: () => client.cnous.etudiant_boursier_identite(cnousParams),
      }),
  };

  return Promise.all(keys.map((k) => resourceCalls[k]()));
};

// Allowances verifiable through a single API Particulier "identité" endpoint.
export type VerifiableAllowance = ALLOWANCE.AAH | ALLOWANCE.AEEH | ALLOWANCE.CROUS;

// Mode "identité pivot" for ONE allowance: used by the no-FranceConnect journey
// when the LCA search found nothing — verifies the typed identity against the
// endpoint matching the allowance the user selected.
export const callApiParticulierAllowanceIdentite = async (
  allowance: VerifiableAllowance,
  identity: FranceConnectIdentity,
  audit: AuditContext,
): Promise<ApiParticulierResourceResult> => {
  const client = getClient();
  const redis = await getRedis();

  switch (allowance) {
    case ALLOWANCE.AAH:
      return callResource({
        redis,
        audit,
        resource: 'dss.allocation_adulte_handicape_identite',
        label: 'Allocation adulte handicapé (AAH)',
        call: () => client.dss.allocation_adulte_handicape_identite(toDssParams(identity)),
      });
    case ALLOWANCE.AEEH:
      return callResource({
        redis,
        audit,
        resource: 'dss.allocation_enfant_handicape_identite',
        label: "Allocation d'éducation de l'enfant handicapé (AEEH)",
        call: () => client.dss.allocation_enfant_handicape_identite(toDssParams(identity)),
      });
    case ALLOWANCE.CROUS:
      return callResource({
        redis,
        audit,
        resource: 'cnous.etudiant_boursier_identite',
        label: 'Statut étudiant boursier',
        call: () => client.cnous.etudiant_boursier_identite(toCnousParams(identity)),
      });
  }
};
