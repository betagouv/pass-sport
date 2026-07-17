// POC step 2: batch LCA processing, driven entirely by the session (FranceConnect
// identity + API Particulier results + residence INSEE stored at /collect).
//
// Bodyless POST. In one call, every beneficiary is searched then auto-confirmed
// against LCA (first result): the connected user when eligible to AAH/CROUS, and
// every child from the quotient familial. The user never sees the search/confirm
// mechanics — the client only receives per-beneficiary outcomes.
//
// When LCA yields no code for a beneficiary, apiParticulierEligible carries the
// API Particulier fallback verdict (AAH/CROUS/ARS/AEEH rules) so the client can
// point eligible people to the contact form.
//
// The LCA API is temporarily unavailable: calls go through lca-client, which
// mocks the responses unless LCA_API_ENABLED === 'true'.

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import {
  confirmBeneficiary,
  searchBeneficiary,
} from '@/app/v2/api/poc-fc-api-particulier/lca-client';
import {
  BeneficiaryCandidate,
  buildConfirmPayload,
  buildSearchPayload,
  listBeneficiaryCandidates,
  stripReasonsUnlessLocal,
} from '@/app/services/lca-bridge';
import { deletePocResult, loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { ApiParticulierResults } from '@/app/services/api-particulier';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { BatchEligibilityResponse, BeneficiaryResult } from './types';

// Same default as the manual eligibility-test routes (CROUS students often have
// no address on file).
const DEFAULT_INSEE_CODE = '75113';

// Unlike the manual flow (where the user typed their matricule themselves), here
// the matricule comes from LCA: strip it from the confirm response.
const sanitizeConfirm = <T extends { allocataire?: { matricule?: string } }>(items: T[]): T[] =>
  items.map((item) =>
    item.allocataire
      ? { ...item, allocataire: { ...item.allocataire, matricule: undefined } }
      : item,
  );

const processCandidate = async (
  candidate: BeneficiaryCandidate,
  identity: FranceConnectIdentity,
  apiParticulier: ApiParticulierResults,
  residenceInsee: string,
): Promise<BeneficiaryResult> => {
  // No code from LCA: fall back to the API Particulier eligibility verdict.
  const fallback = (status: 'not_found' | 'error'): BeneficiaryResult => ({
    candidate,
    status,
    apiParticulierEligible: candidate.eligibilities.length > 0,
  });

  try {
    const payload = buildSearchPayload(candidate, residenceInsee);
    let search = await searchBeneficiary(payload);

    // CROUS students often have no address on file: retry with the default INSEE
    // code, mirroring the manual eligibility-test flow.
    if (!('message' in search) && search.length === 0 && payload.isFromCrous) {
      search = await searchBeneficiary({ ...payload, recipientResidencePlace: DEFAULT_INSEE_CODE });
    }

    if ('message' in search) {
      return fallback('error');
    }

    if (search.length === 0) {
      return fallback('not_found');
    }

    // Always confirm the first result: the search payload already carries the
    // full FranceConnect-verified identity (name, birthdate, commune), so extra
    // matches are duplicate records for the same person, not other people.
    const confirm = await confirmBeneficiary(
      buildConfirmPayload(search[0], identity, apiParticulier),
      search[0],
    );

    if (!Array.isArray(confirm) || confirm.length === 0) {
      // A search match that cannot be confirmed is anomalous.
      return fallback('error');
    }

    return { candidate, status: 'confirmed', confirm: sanitizeConfirm(confirm) };
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.captureMessage('FranceConnect POC: LCA processing failed for a beneficiary');
      scope.captureException(e);
    });
    // One failing beneficiary must not abort the rest of the batch.
    return fallback('error');
  }
};

export async function POST(): Promise<Response> {
  try {
    const pocResult = await loadPocResult();
    // apiParticulier is set only once the aides + commune form is confirmed (the
    // /collect step); this route is unreachable before that.
    if (!pocResult || !pocResult.apiParticulier) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const { identity, apiParticulier, residenceInsee } = pocResult;
    if (!residenceInsee) {
      return NextResponse.json({ error: 'Commune de résidence manquante.' }, { status: 409 });
    }

    // Every JSON response below embeds candidate data: the debug reasons are
    // stripped outside local before anything reaches the client.
    const candidates = stripReasonsUnlessLocal(listBeneficiaryCandidates(identity, apiParticulier));

    // Every QF child goes through LCA; the connected user only when the API
    // Particulier data flags them AAH or CROUS.
    const toProcess = candidates.filter(
      (candidate) =>
        candidate.source === 'enfant' ||
        candidate.eligibilities.includes(ALLOWANCE.AAH) ||
        candidate.eligibilities.includes(ALLOWANCE.CROUS),
    );

    const results: BeneficiaryResult[] = [];
    for (const candidate of toProcess) {
      // Sequential on purpose: no parallel load on the LCA API.
      results.push(await processCandidate(candidate, identity, apiParticulier, residenceInsee));
    }

    // Codes delivered for everyone: destroy the session immediately — the
    // personal data has served its purpose. On partial failure the session is
    // kept (bounded by its TTL) so the user can retry or re-edit.
    if (results.length > 0 && results.every((result) => result.status === 'confirmed')) {
      await deletePocResult();
    }

    const response: BatchEligibilityResponse = { results, eligibilitySummary: candidates };
    return NextResponse.json(response);
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC eligibility step failed');
      scope.captureException(e);
    });
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
