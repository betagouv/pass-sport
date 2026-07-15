import { Client, ApiGouvError, Response as ApiResponse } from '@api-gouv-dinum/api-particulier';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { getRedis } from '@/app/services/redis';
import { acquireToken, RateLimitedError, RedisLike } from '@/app/services/rate-limiter';
import { AuditContext, writeAuditEvent } from '@/app/services/audit';
import {
  QuotientFamilialData,
  PersonneQuotientFamilial,
  StatutBeneficiaireData,
  AllocationEnfantHandicapeData,
  AllocationRentreeScolaireData,
  EtudiantBoursierData,
} from '@/types/ApiParticulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

type ApiParticulierData =
  | QuotientFamilialData
  | StatutBeneficiaireData
  | AllocationEnfantHandicapeData
  | AllocationRentreeScolaireData
  | EtudiantBoursierData;

export interface ApiParticulierResourceResult {
  resource: string;
  label: string;
  httpStatus: number | null;
  success: boolean;
  data: ApiParticulierData | null;
  error?: string;
  // Set on per-child rows: index into QuotientFamilialData.enfants the row belongs to.
  childIndex?: number;
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

// ARS (allocation de rentrée scolaire) is not in the SDK yet — called through the
// generic client.get(), which skips the SDK's snake_case -> camelCase param mapping,
// hence the camelCase query params here (recipient comes from defaultParams).
const ARS_IDENTITE_PATH = '/v3/dss/allocation_rentree_scolaire/identite';

const toArsIdentiteParams = (identity: FranceConnectIdentity) => {
  const { annee_date_naissance, mois_date_naissance, jour_date_naissance } = splitBirthdate(
    identity.birthdate,
  );
  return {
    nomNaissance: identity.family_name,
    prenoms: splitPrenoms(identity.given_name),
    anneeDateNaissance: annee_date_naissance,
    moisDateNaissance: mois_date_naissance,
    jourDateNaissance: jour_date_naissance,
    sexeEtatCivil: mapGender(identity.gender),
    codeCogInseeCommuneNaissance: identity.birthplace || undefined,
    codeCogInseePaysNaissance: identity.birthcountry || undefined,
  };
};

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
  childIndex?: number;
  call: () => Promise<ApiResponse>;
}

const callResource = async ({
  redis,
  audit,
  resource,
  label,
  childIndex,
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
      childIndex,
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
        childIndex,
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
        childIndex,
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
type ResourceKey = 'qf' | 'aah' | 'aeeh' | 'ars' | 'crous';
const RESOURCE_ORDER: ResourceKey[] = ['qf', 'aah', 'aeeh', 'ars', 'crous'];

// Which resources each harvested aide requires. quotient_familial is pulled for
// ARS/AEEH (allocataire + enfants), never for AAH-only / CROUS-only.
const ALLOWANCE_RESOURCES: Record<ALLOWANCE, ResourceKey[]> = {
  [ALLOWANCE.AAH]: ['aah'],
  [ALLOWANCE.AEEH]: ['qf', 'aeeh'],
  [ALLOWANCE.ARS]: ['qf', 'ars'],
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
    ars: () =>
      callResource({
        redis,
        audit,
        resource: 'dss.allocation_rentree_scolaire_identite',
        label: 'Allocation de rentrée scolaire (ARS)',
        call: () => client.get(ARS_IDENTITE_PATH, { params: toArsIdentiteParams(identity) }),
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

  const results = await Promise.all(keys.map((k) => resourceCalls[k]()));
  return withChildrenResults(results, allowances, redis, audit);
};

// QF dates come back as "AAAA-MM-JJ" or "JJ/MM/AAAA" depending on the provider
// (CAF/MSA) — normalize to ISO so splitBirthdate works (mirrors lca-bridge).
const toIsoBirthdate = (date?: string): string | undefined => {
  if (!date) return undefined;
  const frMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  return undefined;
};

// Synthetic pivot identity for a QF child, so the identité param builders can be
// reused. QF children carry no birth COG — the endpoints accept its absence.
const enfantToIdentity = (enfant: PersonneQuotientFamilial): FranceConnectIdentity | null => {
  const familyName = enfant.nom_naissance || enfant.nom_usage;
  const birthdate = toIsoBirthdate(enfant.date_naissance);
  if (!familyName || !enfant.prenoms || !birthdate) return null;

  return {
    sub: 'qf-enfant',
    family_name: familyName,
    given_name: enfant.prenoms,
    gender: enfant.sexe === 'F' ? 'female' : enfant.sexe === 'M' ? 'male' : undefined,
    birthdate,
  };
};

// ARS/AEEH beneficiaries are children: once quotient_familial returned the family
// composition, each child is checked against the ARS + AEEH "identité" endpoints.
const callApiParticulierChildrenIdentite = async (
  enfants: PersonneQuotientFamilial[],
  redis: RedisLike,
  audit: AuditContext,
): Promise<ApiParticulierResults> => {
  const client = getClient();

  const calls = enfants.flatMap((enfant, childIndex) => {
    const identity = enfantToIdentity(enfant);
    if (!identity) return [];

    const prenom = (identity.given_name ?? '').trim().split(/\s+/)[0] ?? '';
    return [
      callResource({
        redis,
        audit,
        resource: 'dss.allocation_rentree_scolaire_identite',
        label: `Allocation de rentrée scolaire (ARS) — ${prenom}`,
        childIndex,
        call: () => client.get(ARS_IDENTITE_PATH, { params: toArsIdentiteParams(identity) }),
      }),
      callResource({
        redis,
        audit,
        resource: 'dss.allocation_enfant_handicape_identite',
        label: `Allocation d'éducation de l'enfant handicapé (AEEH) — ${prenom}`,
        childIndex,
        call: () => client.dss.allocation_enfant_handicape_identite(toDssParams(identity)),
      }),
    ];
  });

  return Promise.all(calls);
};

// Appends the per-child ARS/AEEH rows when the selection involves children.
const withChildrenResults = async (
  results: ApiParticulierResults,
  allowances: ALLOWANCE[],
  redis: RedisLike,
  audit: AuditContext,
): Promise<ApiParticulierResults> => {
  if (!allowances.includes(ALLOWANCE.ARS) && !allowances.includes(ALLOWANCE.AEEH)) {
    return results;
  }

  const qf = results.find(
    (r) => r.resource.startsWith('dss.quotient_familial') && r.success && r.data !== null,
  );
  const enfants = (qf?.data as QuotientFamilialData | undefined)?.enfants ?? [];
  if (!enfants.length) {
    return results;
  }

  return [...results, ...(await callApiParticulierChildrenIdentite(enfants, redis, audit))];
};

// Allowances verifiable through a single API Particulier "identité" endpoint.
export type VerifiableAllowance = ALLOWANCE.AAH | ALLOWANCE.AEEH | ALLOWANCE.ARS | ALLOWANCE.CROUS;

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
    case ALLOWANCE.ARS:
      return callResource({
        redis,
        audit,
        resource: 'dss.allocation_rentree_scolaire_identite',
        label: 'Allocation de rentrée scolaire (ARS)',
        call: () => client.get(ARS_IDENTITE_PATH, { params: toArsIdentiteParams(identity) }),
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
