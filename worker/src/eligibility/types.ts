// API Particulier resources reachable with the allocataire pivot identity. AEEH is
// absent on purpose: its beneficiaries are children, queried per child AFTER
// quotient_familial returns the family composition.
export type ResourceKey = "qf" | "aah" | "cnous";

export const RESOURCE_ORDER: ResourceKey[] = ["qf", "aah", "cnous"];

// QF is the "quotient familial < 700" route: it makes every child of the household
// eligible on the household's QF alone, with no per-child call.
export const ALLOWANCE = {
  AAH: "AAH",
  CROUS: "CROUS",
  AEEH: "AEEH",
  QF: "QF",
} as const;

export type Allowance = (typeof ALLOWANCE)[keyof typeof ALLOWANCE];

export const CAISSE = { CAF: "CAF", MSA: "MSA" } as const;

export type Caisse = (typeof CAISSE)[keyof typeof CAISSE];

// AEEH and QF both pull quotient_familial — AEEH for the family composition it needs
// before calling per child, QF for the household's quotient value itself.
export const ALLOWANCE_RESOURCES: Record<Allowance, ResourceKey[]> = {
  [ALLOWANCE.AAH]: ["aah"],
  [ALLOWANCE.CROUS]: ["cnous"],
  [ALLOWANCE.AEEH]: ["qf"],
  [ALLOWANCE.QF]: ["qf"],
};

// pass Sport 2026 campaign windows, as inclusive birthdate bounds. Derived from
// AGE_REFERENCE_DATE (2026-12-31, lca/candidates.ts): the QF route covers 6-17 ans,
// the AEEH route 17-19 ans.
//
// They overlap on the 2009 millésime (17 ans). QF wins there: a child the household
// quotient already covers costs no AEEH call (see planChildrenChecks in sequence.ts).
export const QF_BIRTHDATE_MIN = "2009-01-01";
export const QF_BIRTHDATE_MAX = "2020-12-31";
export const AEEH_BIRTHDATE_MIN = "2007-01-01";
export const AEEH_BIRTHDATE_MAX = "2009-12-31";

// Strictly below: 700 itself is NOT eligible.
export const QF_ELIGIBILITY_THRESHOLD = 700;

// Safe as a string compare: birthdates are normalized to zero-padded YYYY-MM-DD, whose
// lexicographic order is its chronological order.
export const isWithinBirthdateWindow = (
  birthdate: string | undefined,
  min: string,
  max: string,
): boolean => !!birthdate && birthdate >= min && birthdate <= max;

// True when the household quotient makes its children eligible on its own. Requires the
// usager to have actually claimed that route — an unclaimed QF value grants nothing.
export const householdQfCovers = (
  aides: Allowance[],
  qf: QuotientFamilialData | null | undefined,
): boolean => {
  if (!aides.includes(ALLOWANCE.QF)) return false;
  const valeur = qf?.quotient_familial?.valeur;
  return typeof valeur === "number" && valeur < QF_ELIGIBILITY_THRESHOLD;
};

// Pivot identity (subset of FranceConnect's /userinfo used by the identité endpoints).
export type PivotIdentity = {
  // FranceConnect pairwise pseudonym. NOT part of the identité pivot — carried purely
  // as a lookup key: opaque, identical across fournisseurs d'identité, and changes
  // only on an état civil modification. Never fed to API Particulier.
  sub?: string;
  family_name: string;
  preferred_username?: string;
  given_name?: string;
  birthdate?: string;
  gender?: "male" | "female";
  birthplace?: string; // code COG INSEE commune de naissance
  birthcountry?: string; // code COG INSEE pays de naissance
  email?: string;
};

export type PersonneQuotientFamilial = {
  nom_naissance?: string;
  nom_usage?: string;
  prenoms?: string;
  date_naissance?: string;
  sexe?: string;
};

export type QuotientFamilialData = {
  allocataires: PersonneQuotientFamilial[];
  enfants: PersonneQuotientFamilial[];
  adresse?: Record<string, unknown>;
  quotient_familial: {
    fournisseur?: string;
    valeur: number;
    annee?: number;
    mois?: number;
  };
};

export type StatutBeneficiaireData = {
  est_beneficiaire: boolean;
  date_debut_droit?: string;
};

export type AllocationEnfantHandicapeData = {
  status: string;
  date_debut_droit?: string | null;
};

export type EtudiantBoursierData = {
  ine?: string;
  statut_boursier: {
    est_boursier: boolean;
    est_radie?: boolean;
    date_radiation?: string | null;
  };
  echelon_bourse?: { echelon?: string };
};

export type ApiParticulierData =
  | QuotientFamilialData
  | StatutBeneficiaireData
  | AllocationEnfantHandicapeData
  | EtudiantBoursierData;

// One normalized result row, produced identically by the real and mock clients.
export type ResourceResult = {
  resource: string;
  label: string;
  httpStatus: number | null;
  success: boolean;
  data: ApiParticulierData | null;
  error?: string;
  childIndex?: number; // index into QuotientFamilialData.enfants
  rateLimited?: boolean;
  retryAfter?: number | null;
  // URL effectivement appelée, query params compris — pour debug uniquement. Le SDK ne
  // la remonte que sur ses erreurs (ApiGouvError.url), pas sur une réponse 2xx. Contient
  // l'identité pivot en clair : ne pas logguer ni persister hors contexte de debug.
  requestUrl?: string | null;
  // Rate-limit state surfaced on EVERY call (success and 429). Enables proactive pausing.
  rateLimitRemaining?: number | null;
  rateLimitResetMs?: number | null;
};

// Persisted across BullMQ retries in job.data so a 429-interrupted job resumes
// where it stopped instead of re-running (and re-billing) completed calls.
export type EligibilityCheckpoint = {
  // key -> true once that call succeeded. Parent keys are ResourceKey; child
  // keys are `aeeh:${childIndex}`.
  done: Record<string, boolean>;
  results: ResourceResult[];
};

// What the site puts on the queue.
export type EligibilityJobPayload = {
  identity: PivotIdentity;
  aides: Allowance[];
  isFranceConnected: boolean;
  residenceInsee: string; // INSEE code of the commune de résidence (LCA search)
  clientIp?: string | null;
  userAgent?: string | null;
};

// What BullMQ actually stores: the payload plus the checkpoint the worker writes back
// across retries.
export type EligibilityJobData = EligibilityJobPayload & {
  checkpoint?: EligibilityCheckpoint;
};

// 'FSS' (bourse régionale des formations sanitaires et sociales) is an LCA situation with
// no API Particulier counterpart: the CNOUS bouquet only covers l'enseignement supérieur.
export const SITUATION = { ...ALLOWANCE, FSS: "FSS" } as const;

export type Situation = (typeof SITUATION)[keyof typeof SITUATION];

// Routes where the pass Sport beneficiary is a child of the allocataire. On every other
// route the allocataire IS the beneficiary, which decides who API Particulier is queried
// about and whose identity the job is keyed on.
const CHILD_AIDES: Situation[] = [SITUATION.QF, SITUATION.AEEH];

export const isChildAide = (aide: Situation): boolean => CHILD_AIDES.includes(aide);

// What the combined form (no FranceConnect) puts on the queue. Unlike the FranceConnect
// payload this carries a DECLARED identity, not a verified one, and exactly one aide.
export type ApiParticulierJobPayload = {
  aide: Situation;
  caisse: Caisse | null; // null for the boursier routes (organisme is always cnous)

  // For QF/AEEH a child of the allocataire; for AAH and the boursier routes, the
  // allocataire themselves.
  beneficiary: { lastname: string; firstname: string; birthdate: string };

  allocataire: PivotIdentity;

  // LCA wants the pays de naissance as ISO 3166-1 alpha-2 while API Particulier wants the
  // COG carried by allocataire.birthcountry. Only the site holds the conversion table.
  birthCountryIso?: string;

  cafNumber?: string;
  ine?: string;

  residenceInsee: string; // INSEE code of the commune de résidence (LCA search)
  email: string;
  clientIp?: string | null;
  userAgent?: string | null;
};

export type ApiParticulierJobData = ApiParticulierJobPayload & {
  checkpoint?: EligibilityCheckpoint;
};
