import {
  AAH_BIRTHDATE_MAX,
  AAH_BIRTHDATE_MIN,
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  CROUS_BIRTHDATE_MAX,
  CROUS_BIRTHDATE_MIN,
  QF_BIRTHDATE_MAX,
  QF_BIRTHDATE_MIN,
  ALLOWANCE,
  QF_ELIGIBILITY_THRESHOLD,
  householdQfCovers,
  isWithinBirthdateWindow,
  type Allowance,
  type PivotIdentity,
  type ResourceResult,
} from "../eligibility/types";
import {
  AEEH_RESOURCE,
  childAeehVerdict,
  findChildResource,
  hasAahRight,
  hasBourse,
  readQuotientFamilial,
} from "../eligibility/verdicts";
import {
  LCA_SITUATION,
  ORGANISME,
  type BeneficiaryCandidate,
  type ConfirmPayload,
  type SearchItem,
  type SituationType,
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

// An allocataire outside both self windows is not a candidate: nothing was ever asked about
// them. But when they are also the only person this job knows of, writing nothing at all leaves
// applications_by_sub empty — the usager is not recognised as having applied, so every
// reconnection re-burns the whole API Particulier chain, and /api/france-connect/result reads the
// empty list as "not committed yet" and polls until it gives up. One row says what happened.
const allocataireWithoutAnyRoute = (identity: PivotIdentity): BeneficiaryCandidate | null => {
  if (!identity.family_name || !identity.given_name || !identity.birthdate) return null;

  return {
    source: "self",
    lastname: identity.family_name,
    firstname: identity.given_name,
    birthdate: identity.birthdate,
    eligibilities: [],
    reasons: [
      `${ageAtReferenceDate(identity.birthdate)} ans: hors des fenêtres AAH (16-30) et CROUS (≤28), aucun enfant exploitable`,
    ],
  };
};

// Every person this job pronounces on: each QF child, plus the connected user when at least
// one of the two self routes was actually queried. QF and AEEH are aides for a child, so on
// those routes the allocataire is not a beneficiary.
// Children are not filtered — eligibilities carry the verdict.
export const listBeneficiaryCandidates = (
  identity: PivotIdentity,
  results: ResourceResult[],
): BeneficiaryCandidate[] => {
  const candidates: BeneficiaryCandidate[] = [];

  // The same two windows sequence.ts gates the AAH and CROUS calls on, so a self row means
  // "we asked about you, here is what came back" and never "we never looked".
  const selfWasQueried =
    isWithinBirthdateWindow(identity.birthdate, AAH_BIRTHDATE_MIN, AAH_BIRTHDATE_MAX) ||
    isWithinBirthdateWindow(identity.birthdate, CROUS_BIRTHDATE_MIN, CROUS_BIRTHDATE_MAX);

  if (selfWasQueried && identity.family_name && identity.given_name && identity.birthdate) {
    const age = ageAtReferenceDate(identity.birthdate);
    const eligibilities: Allowance[] = [];
    const reasons: string[] = [];

    if (
      hasAahRight(results) &&
      isWithinBirthdateWindow(identity.birthdate, AAH_BIRTHDATE_MIN, AAH_BIRTHDATE_MAX)
    ) {
      eligibilities.push(ALLOWANCE.AAH);
      reasons.push(`AAH: bénéficiaire, ${age} ans (16-30)`);
    }

    if (
      hasBourse(results) &&
      isWithinBirthdateWindow(identity.birthdate, CROUS_BIRTHDATE_MIN, CROUS_BIRTHDATE_MAX)
    ) {
      eligibilities.push(ALLOWANCE.CROUS);
      reasons.push(`CROUS: boursier, ${age} ans (≤28)`);
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
  //   - QF: the household quotient is under the threshold -> every child 6-17 ans is
  //     eligible, no per-child call involved;
  //   - AEEH: for 6-19 ans, on the child's own per-child verdict.
  // The windows overlap on 2009-2020; QF has priority there, which is also why sequence.ts
  // skips the AEEH call for those children.
  const qfData = readQuotientFamilial(results);
  const qfCovers = householdQfCovers(qfData);
  const enfants = qfData?.enfants ?? [];

  enfants.forEach((enfant, childIndex) => {
    // nom de naissance only, like enfantToIdentity in ../eligibility/sequence.ts: the AEEH
    // call goes out under that name, so recording the nom d'usage here would describe the
    // child differently from the query that judged them.
    const lastname = enfant.nom_naissance;
    const firstname = enfant.prenoms;
    const birthdate = toIsoDate(enfant.date_naissance);
    if (!lastname || !firstname || !birthdate) return;

    // Same conversion as enfantToIdentity in ../eligibility/sequence.ts.
    const gender = enfant.sexe === "F" ? "female" : enfant.sexe === "M" ? "male" : undefined;

    const age = ageAtReferenceDate(birthdate);
    const eligibilities: Allowance[] = [];
    const reasons: string[] = [];

    const aeehVerdict = childAeehVerdict(findChildResource(results, AEEH_RESOURCE, childIndex));

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
      reasons.push(`AEEH: bénéficiaire, ${age} ans (6-19)`);
    }

    candidates.push({
      source: "enfant",
      lastname,
      firstname,
      birthdate,
      gender,
      eligibilities,
      reasons,
    });
  });

  if (candidates.length === 0) {
    const allocataire = allocataireWithoutAnyRoute(identity);
    if (allocataire) candidates.push(allocataire);
  }

  return candidates;
};

// FranceConnect birthcountry is a COG INSEE code; LCA expects ISO 3166-1 alpha-2.
// Only France mapped; foreign countries omitted (the field is optional).
export const cogCountryToIso = (cog?: string): string | undefined =>
  cog === "99100" ? "FR" : undefined;

// A subset of the identité pivot rather than the pivot itself: allocataire_identite is stored as a
// Partial, and this builder has to accept it as-is.
export type AllocataireConfirmIdentity = {
  family_name?: string;
  given_name?: string;
  birthdate?: string;
  birthplace?: string;
  birthcountry?: string;
};

// /search echoes back the 'AEEH' our own pipeline injected into the LCA base
// (clean_fc_lib.resolve_situation), but /confirm does not know that value: there, such a child
// belongs to 'jeune'.
export const toConfirmSituation = (situation: SituationType): string =>
  situation === LCA_SITUATION.AEEH ? LCA_SITUATION.JEUNE : situation;

// The allocataire is named from the identité pivot rather than from the QF allocataires[0], which
// is not guaranteed to be them. The matricule is server-side only and comes back from the search.
export const buildConfirmPayload = (
  searchItem: SearchItem,
  identity: AllocataireConfirmIdentity,
): ConfirmPayload => {
  const isCrous =
    searchItem.situation === LCA_SITUATION.BOURSIER && searchItem.organisme === ORGANISME.CNOUS;
  const matricule = searchItem.matricule || undefined;

  return {
    id: String(searchItem.id),
    situation: toConfirmSituation(searchItem.situation),
    organisme: searchItem.organisme,
    recipientLastname: identity.family_name,
    recipientFirstname: identity.given_name || "",
    recipientIneNumber: isCrous ? matricule : undefined,
    recipientCafNumber: isCrous ? undefined : matricule,
    recipientBirthDate: identity.birthdate,
    recipientBirthPlace: identity.birthplace || undefined,
    recipientBirthCountry: cogCountryToIso(identity.birthcountry),
  };
};
