import {
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  ALLOWANCE,
  QF_ELIGIBILITY_THRESHOLD,
  householdQfCovers,
  isWithinBirthdateWindow,
  type AllocationEnfantHandicapeData,
  type Allowance,
  type EtudiantBoursierData,
  type PivotIdentity,
  type QuotientFamilialData,
  type ResourceResult,
  type StatutBeneficiaireData,
} from "../eligibility/types";
import {
  LCA_SITUATION,
  ORGANISME,
  type BeneficiaryCandidate,
  type ConfirmPayload,
  type SearchItem,
  type SearchPayload,
} from "./types";
const AGE_REFERENCE_DATE = "2026-12-31";

// Completed years ("ans révolus") at the reference date.
export const ageAtReferenceDate = (birthdate: string): number => {
  const [ry, rm, rd] = AGE_REFERENCE_DATE.split("-").map(Number);
  const [by, bm, bd] = birthdate.split("-").map(Number);

  let age = ry - by;

  if (rm < bm || (rm === bm && rd < bd)) age -= 1;

  return age;
};

// Normalizes API Particulier dates ("DD/MM/YYYY" or ISO) to YYYY-MM-DD.
export const toIsoDate = (date?: string): string | null => {
  if (!date) return null;

  const fr = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (fr) return `${fr[3]}-${fr[2]}-${fr[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);

  return null;
};

const findResource = (results: ResourceResult[], prefix: string): ResourceResult | undefined =>
  results.find(
    (r) => r.resource.startsWith(prefix) && r.childIndex === undefined && r.success && r.data != null,
  );

const findChildResource = (
  results: ResourceResult[],
  resource: string,
  childIndex: number,
): ResourceResult | undefined =>
  results.find((r) => r.resource === resource && r.childIndex === childIndex);

// Verdict from a per-child AEEH row: true/false when the API answered, null when
// there is no usable row.
export const childStatusVerdict = (row: ResourceResult | undefined): boolean | null => {
  if (!row) return null;
  if (row.success && row.data) {
    const { status } = row.data as AllocationEnfantHandicapeData;
    return status === "allocataire" || status === "ouvrant_droit";
  }
  return row.httpStatus === 404 ? false : null;
};

const getQf = (r: ResourceResult[]): QuotientFamilialData | null =>
  (findResource(r, "dss.quotient_familial")?.data as QuotientFamilialData) ?? null;
const getAah = (r: ResourceResult[]): StatutBeneficiaireData | null =>
  (findResource(r, "dss.allocation_adulte_handicape")?.data as StatutBeneficiaireData) ?? null;
const getBoursier = (r: ResourceResult[]): EtudiantBoursierData | null =>
  (findResource(r, "cnous.etudiant_boursier")?.data as EtudiantBoursierData) ?? null;

// Every person the LCA search can target: connected user + each QF child. Nobody is
// filtered here (the LCA base decides); eligibilities feed the fallback.
export const listBeneficiaryCandidates = (
  identity: PivotIdentity,
  results: ResourceResult[],
  aides: Allowance[],
): BeneficiaryCandidate[] => {
  const candidates: BeneficiaryCandidate[] = [];

  // Connected user: AAH (16-30) and étudiant boursier (< 28).
  if (identity.family_name && identity.given_name && identity.birthdate) {
    const age = ageAtReferenceDate(identity.birthdate);
    const eligibilities: Allowance[] = [];
    const reasons: string[] = [];

    if (getAah(results)?.est_beneficiaire && age >= 16 && age <= 30) {
      eligibilities.push(ALLOWANCE.AAH);
      reasons.push(`AAH: bénéficiaire, ${age} ans (16-30)`);
    }

    if (getBoursier(results)?.statut_boursier?.est_boursier && age < 28) {
      eligibilities.push(ALLOWANCE.CROUS);
      reasons.push(`CROUS: boursier, ${age} ans (<28)`);
    }

    candidates.push({
      source: "self",
      lastname: identity.family_name,
      firstname: identity.given_name,
      birthdate: identity.birthdate,
      eligibilities,
      reasons,
    });
  }

  // QF children, two exclusive routes:
  //   - QF: the household quotient is under the threshold and the usager claimed that
  //     route -> every child 6-17 ans is eligible, no per-child call involved;
  //   - AEEH: for 17-19 ans, on the child's own per-child verdict.
  // The windows overlap on 17 ans (2009); QF has priority there, which is also why
  // sequence.ts skips the AEEH call for those children.
  const qfData = getQf(results);
  const qfCovers = householdQfCovers(aides, qfData);
  const enfants = qfData?.enfants ?? [];

  enfants.forEach((enfant, childIndex) => {
    const lastname = enfant.nom_usage || enfant.nom_naissance;
    const firstname = enfant.prenoms;
    const birthdate = toIsoDate(enfant.date_naissance);
    if (!lastname || !firstname || !birthdate) return;

    const age = ageAtReferenceDate(birthdate);
    const eligibilities: Allowance[] = [];
    const reasons: string[] = [];

    const aeehVerdict = childStatusVerdict(
      findChildResource(results, "dss.allocation_enfant_handicape_identite", childIndex),
    );

    if (qfCovers && isWithinBirthdateWindow(birthdate, QF_BIRTHDATE_MIN, QF_BIRTHDATE_MAX)) {
      eligibilities.push(ALLOWANCE.QF);
      reasons.push(
        `QF: quotient ${qfData?.quotient_familial?.valeur} < ${QF_ELIGIBILITY_THRESHOLD}, ${age} ans (6-17)`,
      );
    } else if (
      aeehVerdict &&
      isWithinBirthdateWindow(birthdate, AEEH_BIRTHDATE_MIN, AEEH_BIRTHDATE_MAX)
    ) {
      eligibilities.push(ALLOWANCE.AEEH);
      reasons.push(`AEEH: bénéficiaire, ${age} ans (17-19)`);
    }

    candidates.push({ source: "enfant", lastname, firstname, birthdate, eligibilities, reasons });
  });

  return candidates;
};

export const buildSearchPayload = (
  candidate: BeneficiaryCandidate,
  residenceInsee: string,
): SearchPayload => ({
  beneficiaryLastname: candidate.lastname,
  beneficiaryFirstname: candidate.firstname,
  beneficiaryBirthDate: candidate.birthdate,
  recipientResidencePlace: residenceInsee,
  allowanceName: candidate.eligibilities[0],
  isFromCrous: candidate.eligibilities.includes(ALLOWANCE.CROUS),
});

// FranceConnect birthcountry is a COG INSEE code; LCA expects ISO 3166-1 alpha-2.
// Only France mapped; foreign countries omitted (field is optional).
const cogCountryToIso = (cog?: string): string | undefined => (cog === "99100" ? "FR" : undefined);

// Builds the LCA confirm payload for a search result. Allocataire = connected user;
// matricule (server-side only) routes to INE for CROUS, else CAF/MSA number.
export const buildConfirmPayload = (
  searchItem: SearchItem,
  identity: PivotIdentity,
  results: ResourceResult[],
): ConfirmPayload => {
  const allocataire = getQf(results)?.allocataires?.[0];
  const isCrous = searchItem.situation === LCA_SITUATION.BOURSIER && searchItem.organisme === ORGANISME.CNOUS;
  const matricule = searchItem.matricule || undefined;

  return {
    id: String(searchItem.id),
    situation: searchItem.situation,
    organisme: searchItem.organisme,
    recipientLastname: allocataire?.nom_usage || allocataire?.nom_naissance || identity.family_name,
    recipientFirstname: allocataire?.prenoms || identity.given_name || "",
    recipientIneNumber: isCrous ? matricule : undefined,
    recipientCafNumber: isCrous ? undefined : matricule,
    recipientBirthDate: identity.birthdate,
    recipientBirthPlace: identity.birthplace || undefined,
    recipientBirthCountry: cogCountryToIso(identity.birthcountry),
  };
};
