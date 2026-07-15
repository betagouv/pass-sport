// Bridge between the FranceConnect + API Particulier data and the LCA API
// (fetchEligible / fetchCode).
//
// The LCA base is authoritative: every person gathered from FC + API Particulier
// (connected user + QF children) is searched in LCA first. The eligibility rules
// below are only used as a fallback explanation when LCA returns no match — they
// feed the "who is eligible" summary shown with the contact-form link.
//
// Eligibility rules (ages computed at AGE_REFERENCE_DATE):
// - ARS:   jeunes de 12 à 17 ans révolus bénéficiant de l'allocation de rentrée
//          scolaire — children from the QF response, checked against their own
//          per-child ARS "identité" row (childIndex). Age-only fallback when the
//          row is missing or errored (non-404).
// - AEEH:  jeunes de 6 à 19 ans — children from the QF response, checked against
//          their own per-child AEEH "identité" row (childIndex). Fallback to the
//          connected parent's AEEH "allocataire" status when the row is missing
//          or errored (non-404).
// - AAH:   jeunes de 16 à 30 ans bénéficiant de l'AAH — the connected user
//          themselves (est_beneficiaire from API Particulier).
// - CROUS: étudiants boursiers de moins de 28 ans — the connected user themselves
//          (est_boursier from API Particulier).
//
// Sources used to build the LCA payloads:
// - FranceConnect pivot identity (/userinfo): the connected user — beneficiary for
//   AAH/CROUS, allocataire (parent) for ARS/AEEH confirm calls.
// - API Particulier quotient familial: enfants[] are the ARS/AEEH beneficiaries;
//   allocataires[] provides the allocataire names for the LCA confirm call.
// - API Particulier AAH / AEEH / CNOUS: allowance statuses gating the candidates.
//
// Not available from FC / API Particulier: matricule CAF/MSA, INE, and the commune
// de résidence (a postal code maps to several communes, so the QF address cannot
// be converted reliably) — the residence INSEE code is asked to the user. The LCA
// confirm call is done without matricule (LCA can match on identity).

import { differenceInYears, parseISO } from 'date-fns';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import {
  ApiParticulierResults,
  ApiParticulierResourceResult,
} from '@/app/services/api-particulier';
import {
  AllocationEnfantHandicapeData,
  AllocationRentreeScolaireData,
  EtudiantBoursierData,
  QuotientFamilialData,
  StatutBeneficiaireData,
} from 'types/ApiParticulier';
import { ConfirmPayload, SearchPayload, SearchResponseBodyItem } from 'types/EligibilityTest';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

// Reference date for all age computations of the 2026 campaign.
export const AGE_REFERENCE_DATE = '2026-12-31';

// A person the LCA search can target.
export interface BeneficiaryCandidate {
  // 'self' = the connected user (AAH / CROUS); 'enfant' = QF child (ARS / AEEH).
  source: 'self' | 'enfant';
  lastname: string;
  firstname: string;
  // YYYY-MM-DD
  birthdate: string;
  // Allowances this person may qualify for (fallback summary when LCA has no
  // match). Empty = not eligible according to the API Particulier data.
  eligibilities: ALLOWANCE[];
}

// Parent-level rows only: per-child rows share the resource prefix (e.g.
// dss.allocation_enfant_handicape_identite) but carry a childIndex.
const findResource = (
  results: ApiParticulierResults,
  resourcePrefix: string,
): ApiParticulierResourceResult | undefined =>
  results.find(
    (r) =>
      r.resource.startsWith(resourcePrefix) &&
      r.childIndex === undefined &&
      r.success &&
      r.data !== null,
  );

const findChildResource = (
  results: ApiParticulierResults,
  resource: string,
  childIndex: number,
): ApiParticulierResourceResult | undefined =>
  results.find((r) => r.resource === resource && r.childIndex === childIndex);

// Verdict from a per-child ARS/AEEH status row: true/false when the API answered
// (allocataire / ouvrant_droit, or 404 = dossier inexistant), null when there is
// no usable row (not called, rate-limited, provider error) — callers then fall
// back to the pre-existing heuristics.
const childStatusVerdict = (row: ApiParticulierResourceResult | undefined): boolean | null => {
  if (!row) return null;
  if (row.success && row.data) {
    const { status } = row.data as AllocationRentreeScolaireData | AllocationEnfantHandicapeData;
    return status === 'allocataire' || status === 'ouvrant_droit';
  }
  return row.httpStatus === 404 ? false : null;
};

export const getQuotientFamilial = (results: ApiParticulierResults): QuotientFamilialData | null =>
  (findResource(results, 'dss.quotient_familial')?.data as QuotientFamilialData) ?? null;

const getAah = (results: ApiParticulierResults): StatutBeneficiaireData | null =>
  (findResource(results, 'dss.allocation_adulte_handicape')?.data as StatutBeneficiaireData) ??
  null;

const getAeeh = (results: ApiParticulierResults): AllocationEnfantHandicapeData | null =>
  (findResource(results, 'dss.allocation_enfant_handicape')
    ?.data as AllocationEnfantHandicapeData) ?? null;

const getEtudiantBoursier = (results: ApiParticulierResults): EtudiantBoursierData | null =>
  (findResource(results, 'cnous.etudiant_boursier')?.data as EtudiantBoursierData) ?? null;

// Normalizes API Particulier dates ("DD/MM/YYYY" or ISO) to YYYY-MM-DD.
const toIsoDate = (date?: string): string | null => {
  if (!date) return null;
  const frMatch = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) {
    return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return date.slice(0, 10);
  }
  return null;
};

// Completed years ("ans révolus") at the campaign reference date.
// parseISO reads both YYYY-MM-DD strings as local midnight, so the comparison
// is timezone-consistent.
export const ageAtReferenceDate = (birthdate: string): number =>
  differenceInYears(parseISO(AGE_REFERENCE_DATE), parseISO(birthdate));

const firstToken = (value?: string): string => (value ?? '').trim().split(/\s+/)[0] ?? '';

// Lists every person the LCA search can target: the connected user and each QF
// child. Nobody is filtered out — the LCA base decides. The eligibility rules
// are evaluated on the side (eligibilities field) for the no-match fallback
// summary.
export const listBeneficiaryCandidates = (
  identity: FranceConnectIdentity,
  apiParticulier: ApiParticulierResults,
): BeneficiaryCandidate[] => {
  const candidates: BeneficiaryCandidate[] = [];

  // Connected user: AAH (16-30 ans) and étudiant boursier (< 28 ans).
  if (identity.family_name && identity.given_name && identity.birthdate) {
    const age = ageAtReferenceDate(identity.birthdate);
    const eligibilities: ALLOWANCE[] = [];

    if (getAah(apiParticulier)?.est_beneficiaire && age >= 16 && age <= 30) {
      eligibilities.push(ALLOWANCE.AAH);
    }

    if (getEtudiantBoursier(apiParticulier)?.est_boursier && age < 28) {
      eligibilities.push(ALLOWANCE.CROUS);
    }

    candidates.push({
      source: 'self',
      lastname: identity.family_name,
      firstname: firstToken(identity.given_name),
      birthdate: identity.birthdate,
      eligibilities,
    });
  }

  // QF children: ARS (12-17 ans révolus) and AEEH (6-19 ans), checked against
  // their own per-child "identité" rows (matched by childIndex).
  const parentIsAeehAllocataire = getAeeh(apiParticulier)?.status === 'allocataire';

  const enfants = getQuotientFamilial(apiParticulier)?.enfants ?? [];
  for (const [childIndex, enfant] of enfants.entries()) {
    const lastname = enfant.nom_usage || enfant.nom_naissance;
    const firstname = firstToken(enfant.prenoms);
    const birthdate = toIsoDate(enfant.date_naissance);

    if (!lastname || !firstname || !birthdate) continue;

    const age = ageAtReferenceDate(birthdate);
    const eligibilities: ALLOWANCE[] = [];

    const arsVerdict = childStatusVerdict(
      findChildResource(apiParticulier, 'dss.allocation_rentree_scolaire_identite', childIndex),
    );
    const aeehVerdict = childStatusVerdict(
      findChildResource(apiParticulier, 'dss.allocation_enfant_handicape_identite', childIndex),
    );

    // No usable ARS row (missing / provider error): age-only fallback.
    if (age >= 12 && age <= 17 && arsVerdict !== false) {
      eligibilities.push(ALLOWANCE.ARS);
    }

    // No usable AEEH row: fallback to the parent's AEEH status.
    if ((aeehVerdict ?? parentIsAeehAllocataire) && age >= 6 && age <= 19) {
      eligibilities.push(ALLOWANCE.AEEH);
    }

    candidates.push({ source: 'enfant', lastname, firstname, birthdate, eligibilities });
  }

  return candidates;
};

export const buildSearchPayload = (
  candidate: BeneficiaryCandidate,
  // INSEE code of the commune de résidence, provided by the user (CityFinder).
  residenceInsee: string,
): SearchPayload => ({
  beneficiaryLastname: candidate.lastname,
  beneficiaryFirstname: candidate.firstname,
  beneficiaryBirthDate: candidate.birthdate,
  recipientResidencePlace: residenceInsee,
  allowanceName: candidate.eligibilities[0],
  isFromCrous: candidate.eligibilities.includes(ALLOWANCE.CROUS),
});

// FranceConnect birthcountry is a COG INSEE country code; LCA expects ISO 3166-1
// alpha-2. Only France is mapped for now — foreign birth countries are omitted
// rather than guessed (the field is optional in the LCA confirm call).
const cogCountryToIso = (cog?: string): string | undefined => (cog === '99100' ? 'FR' : undefined);

// Builds the LCA confirm payload for a search result. The allocataire is the
// FranceConnect-connected user: names come from the QF response when available
// (they match the CAF/MSA records), birth data comes from the FC pivot identity.
// The matricule comes from the LCA search response itself (server-side only,
// fetchEligible with keepMatricule) — routed to the INE field for CROUS students,
// to the CAF/MSA number otherwise, mirroring buildLCAConfirmUrl.
export const buildConfirmPayload = (
  searchItem: SearchResponseBodyItem,
  identity: FranceConnectIdentity,
  apiParticulier: ApiParticulierResults,
): ConfirmPayload => {
  const allocataire = getQuotientFamilial(apiParticulier)?.allocataires?.[0];

  const isCrous = searchItem.situation === 'boursier' && searchItem.organisme === 'cnous';
  const matricule = searchItem.matricule || undefined;

  return {
    id: String(searchItem.id),
    situation: searchItem.situation,
    organisme: searchItem.organisme,
    recipientLastname: allocataire?.nom_usage || allocataire?.nom_naissance || identity.family_name,
    recipientFirstname: firstToken(allocataire?.prenoms) || firstToken(identity.given_name),
    recipientIneNumber: isCrous ? matricule : undefined,
    recipientCafNumber: isCrous ? undefined : matricule,
    recipientBirthDate: identity.birthdate,
    recipientBirthPlace: identity.birthplace || undefined,
    recipientBirthCountry: cogCountryToIso(identity.birthcountry),
  };
};
