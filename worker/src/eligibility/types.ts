// API Particulier resources reachable with the allocataire pivot identity. AEEH is
// absent on purpose: its beneficiaries are children, queried per child AFTER
// quotient_familial returns the family composition.
export type ResourceKey = "qf" | "aah" | "cnous";

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

// pass Sport 2026 campaign windows, as inclusive birthdate bounds. Derived from
// AGE_REFERENCE_DATE (2026-12-31, lca/candidates.ts) — the reference being a 31 December,
// the birth YEAR alone decides the age:
//
//   QF     enfant       6-17 ans
//   AEEH   enfant       6-19 ans
//   AAH    allocataire  16-30 ans
//   CROUS  allocataire  jusqu'à 28 ans
//
// The same four windows live in site/utils/eligibility-test.ts (parcours hors FranceConnect)
// and data/2026/partners/partners_lib.py. A change here has to be mirrored in both.
//
// QF and AEEH overlap on the whole 2009-2020 range. QF wins there: a child the household
// quotient already covers costs no AEEH call (see planChildrenChecks in sequence.ts).
export const QF_BIRTHDATE_MIN = "2009-01-01";
export const QF_BIRTHDATE_MAX = "2020-12-31";
export const AEEH_BIRTHDATE_MIN = "2007-01-01";
export const AEEH_BIRTHDATE_MAX = "2020-12-31";
export const AAH_BIRTHDATE_MIN = "1996-01-01";
export const AAH_BIRTHDATE_MAX = "2010-12-31";
export const CROUS_BIRTHDATE_MIN = "1998-01-01";
export const CROUS_BIRTHDATE_MAX = "2026-12-31";

// Strictly below: 700 itself is NOT eligible.
export const QF_ELIGIBILITY_THRESHOLD = 700;

export const QF_REFERENCE_YEAR = "2026";
export const QF_REFERENCE_MONTH_MIN = 8;
export const QF_REFERENCE_MONTH_MAX = 12;

// The server clock is UTC, so the month has to be read in Paris time — otherwise the first
// hours of a new month there would still query the previous one.
const PARIS_YEAR_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "numeric",
});

const parisYearMonth = (date: Date): { year: number; month: number } => {
  const parts = PARIS_YEAR_MONTH.formatToParts(date);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);

  return { year: part("year"), month: part("month") };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

// A quotient is a monthly value: the household qualifies as soon as ONE month of the campaign
// falls under the threshold, so the months are queried in ascending order until one does.
// Capped at the current month — a future month has no value to serve — and never empty, since
// quotient_familial is also the only source of the household's children.
export const qfReferenceMonths = (now: Date): string[] => {
  const { year, month } = parisYearMonth(now);
  const campaignYear = Number(QF_REFERENCE_YEAR);

  const lastMonth =
    year === campaignYear
      ? clamp(month, QF_REFERENCE_MONTH_MIN, QF_REFERENCE_MONTH_MAX)
      : year > campaignYear
        ? QF_REFERENCE_MONTH_MAX
        : QF_REFERENCE_MONTH_MIN;

  return Array.from({ length: lastMonth - QF_REFERENCE_MONTH_MIN + 1 }, (_, index) =>
    String(QF_REFERENCE_MONTH_MIN + index),
  );
};

// Safe as a string compare: birthdates are normalized to zero-padded YYYY-MM-DD, whose
// lexicographic order is its chronological order.
export const isWithinBirthdateWindow = (
  birthdate: string | undefined,
  min: string,
  max: string,
): boolean => !!birthdate && birthdate >= min && birthdate <= max;

// True when the household quotient makes its children eligible on its own.
export const householdQfCovers = (qf: QuotientFamilialData | null | undefined): boolean => {
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

// Raw JSON:API error object (ApiGouvError.firstError), kept verbatim alongside the flattened
// `error`/`errorCode` fields below so a caller can persist the provider's exact code/title/
// detail/meta without reconstructing it from those.
export type ApiJsonError = {
  code?: string;
  title?: string;
  detail?: string;
  meta?: Record<string, unknown>;
};

// One normalized result row, produced identically by the real and mock clients.
export type ResourceResult = {
  resource: string;
  label: string;
  httpStatus: number | null;
  success: boolean;
  data: ApiParticulierData | null;
  error?: string;
  // JSON:API `errors[0].code` (e.g. "35000"), when the SDK surfaced one. Lets a caller tell
  // a data provider's own internal error — bound to this one call's data — apart from the
  // API being down, which `error`/`httpStatus` alone cannot (both look like a 5xx).
  errorCode?: string;
  // See ApiJsonError. Undefined when the SDK raised without a JSON:API errors[] body (e.g. a
  // transport failure).
  apiError?: ApiJsonError;
  childIndex?: number; // index into QuotientFamilialData.enfants
  // Which checkpoint entry produced this row: `qf:${mois}` | "aah" | "cnous" |
  // `aeeh:${childIndex}`. `resource` cannot play that role — every swept quotient month shares
  // one, and so does every per-child AEEH answer. Set at commit time, so a row replayed from the
  // checkpoint is matched to the call that actually produced it.
  checkpointKey?: string;
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
  // One row per call that answered, in call order, each carrying the checkpointKey that
  // identifies it. Its presence IS the "already done" flag — a separate index of keys would be a
  // second encoding of the same fact, free to disagree with this one.
  results: ResourceResult[];
};

// What the site puts on the queue.
export type EligibilityJobPayload = {
  identity: PivotIdentity;
  isFranceConnected: boolean;
  clientIp?: string | null;
  userAgent?: string | null;
};

// What BullMQ actually stores: the payload plus what the worker writes back across retries.
export type EligibilityJobData = EligibilityJobPayload & {
  checkpoint?: EligibilityCheckpoint;
  // True once he accusé de réception has gone out.
  acknowledged?: boolean;
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

// One LCA call as the site observed it, replayed verbatim into eligibility_history. The site
// performs /search and /confirm itself now, so it is the only place that sees the raw
// answers; the worker just writes them down.
export type LcaHistoryEvent = {
  action: string;
  status: "success" | "not_found" | "error";
  durationMs: number;
  error?: string;
  bodyPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  // Where jobs enqueued before the payload split carry their answer. Optional on this side
  // only: the site always sends responsePayload. Drop both once the queue has drained past
  // the deploy that renamed the column.
  payload?: Record<string, unknown>;
};

// What the two-step form (no FranceConnect) puts on the queue, once the usager already has
// their answer on screen. It carries the OUTCOME, not the inputs: nothing here is re-queried,
// and no API Particulier call happens on this path at all.
export type LcaJobData = {
  aide: Situation;
  caisse: Caisse | null; // null for the boursier routes (organisme is always cnous)

  // For QF/AEEH a child of the allocataire; for AAH and the boursier routes, the
  // allocataire themselves.
  beneficiary: { lastname: string; firstname: string; birthdate: string };

  allocataire: { family_name?: string; given_name?: string };

  residenceInsee: string; // INSEE code of the commune de résidence (LCA search)

  lcaStatus: "confirmed" | "not_found" | "error";
  passSportCode: string | null;

  // Typed by the usager at the end of step two, and the only address the outcome is ever
  // mailed to. Always present.
  contactEmail: string;

  // Read off the LCA /confirm answer (allocataire.courriel), so it only ever exists when a
  // code was found. Never a recipient: it is compared against contactEmail to decide whether
  // the code may be mailed at all.
  email: string | null;

  history: LcaHistoryEvent[];
  clientIp?: string | null;
  userAgent?: string | null;
};
