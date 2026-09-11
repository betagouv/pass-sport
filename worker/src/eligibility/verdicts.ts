// Reading an API Particulier answer as a yes/no. Lives here rather than in lca/candidates.ts so
// that sequence.ts — which needs the AAH verdict to decide whether to spend a CROUS call — can
// share the definitions instead of restating them.

import {
  CAISSE,
  type AllocationEnfantHandicapeData,
  type Caisse,
  type EtudiantBoursierData,
  type QuotientFamilialData,
  type ResourceResult,
  type StatutBeneficiaireData,
} from "./types";

export const QF_RESOURCE_PREFIX = "dss.quotient_familial";
export const AAH_RESOURCE_PREFIX = "dss.allocation_adulte_handicape";
export const CROUS_RESOURCE_PREFIX = "cnous.etudiant_boursier";
export const AEEH_RESOURCE = "dss.allocation_enfant_handicape_identite";

const answeredAbout = (result: ResourceResult, prefix: string): boolean =>
  result.resource.startsWith(prefix) &&
  result.childIndex === undefined &&
  result.success &&
  result.data != null;

const findSelfResource = (results: ResourceResult[], prefix: string): ResourceResult | undefined =>
  results.find((r) => answeredAbout(r, prefix));

export const findChildResource = (
  results: ResourceResult[],
  resource: string,
  childIndex: number,
): ResourceResult | undefined =>
  results.find((r) => r.resource === resource && r.childIndex === childIndex);

// The LAST quotient_familial answer, not the first: the monthly sweep in sequence.ts emits one
// row per month under the same `resource`, and it stops on the month that opened the right — so
// the last row is always the deciding one. Same row that data/'s export_eligible_pending.sql
// picks (distinct on (job_id, action) order by created_at desc).
export const readQuotientFamilial = (results: ResourceResult[]): QuotientFamilialData | null => {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (answeredAbout(results[index], QF_RESOURCE_PREFIX)) {
      return results[index].data as QuotientFamilialData;
    }
  }

  return null;
};

const CAISSE_BY_FOURNISSEUR: Record<string, Caisse> = {
  CNAF: CAISSE.CAF,
  CAF: CAISSE.CAF,
  MSA: CAISSE.MSA,
};

export const readCaisse = (results: ResourceResult[]): Caisse | null => {
  const fournisseur = readQuotientFamilial(results)?.quotient_familial?.fournisseur;
  return (fournisseur && CAISSE_BY_FOURNISSEUR[fournisseur.trim().toUpperCase()]) || null;
};

export const readAah = (results: ResourceResult[]): StatutBeneficiaireData | null =>
  (findSelfResource(results, AAH_RESOURCE_PREFIX)?.data as StatutBeneficiaireData) ?? null;

export const readBoursier = (results: ResourceResult[]): EtudiantBoursierData | null =>
  (findSelfResource(results, CROUS_RESOURCE_PREFIX)?.data as EtudiantBoursierData) ?? null;

// Row-level: what sequence.ts holds right after a call. A 404 row carries data: null, which is
// an answer meaning "pas bénéficiaire", so it reads as false rather than throwing.
export const isAahBeneficiaryRow = (row: ResourceResult | undefined): boolean =>
  !!row?.success && (row.data as StatutBeneficiaireData | null)?.est_beneficiaire === true;

export const hasAahRight = (results: ResourceResult[]): boolean =>
  readAah(results)?.est_beneficiaire === true;

export const hasBourse = (results: ResourceResult[]): boolean =>
  readBoursier(results)?.statut_boursier?.est_boursier === true;

// true/false when the API answered about that child, null when there is no usable row — which
// is also the case of a child never called because the household quotient already covers them.
export const childAeehVerdict = (row: ResourceResult | undefined): boolean | null => {
  if (!row) return null;

  if (row.success && row.data) {
    const { status } = row.data as AllocationEnfantHandicapeData;
    return status === "allocataire" || status === "ouvrant_droit";
  }

  return row.httpStatus === 404 ? false : null;
};
