// POC step 2: uses the FranceConnect identity + API Particulier results stored in
// the result cookie to drive the LCA calls (fetchEligible, then fetchCode).
//
// POST body: { candidateIndex: number, residenceInsee: string, searchItemId?: number }
// - candidateIndex selects the beneficiary among the eligible candidates rebuilt
//   server-side from the cookie (QF children for ARS/AEEH, connected user for
//   AAH/CROUS).
// - residenceInsee is the INSEE code of the commune de résidence, picked by the
//   user (a postal code maps to several communes, so it cannot be derived from
//   the QF address).
// - searchItemId (optional) confirms a specific LCA search result. When omitted
//   and the search returns exactly one match, it is confirmed automatically.
//
// When the LCA search finds nothing, the response carries eligibilitySummary —
// the API Particulier eligibility assessment for every gathered person — so the
// client can show who is eligible and link to the contact form.

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import z, { ZodError } from 'zod';
import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import {
  buildConfirmPayload,
  buildSearchPayload,
  listBeneficiaryCandidates,
} from '@/app/services/lca-bridge';
import { deletePocResult, loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { SearchResponseBodyItem } from 'types/EligibilityTest';

// Same default as the manual eligibility-test routes (CROUS students often have
// no address on file).
const DEFAULT_INSEE_CODE = '75113';

// The matricule is kept server-side for the confirm call but must never reach
// the browser.
const sanitizeSearch = (items: SearchResponseBodyItem[]) =>
  items.map(({ matricule: _matricule, ...remaining }) => remaining);

// Unlike the manual flow (where the user typed their matricule themselves), here
// the matricule comes from LCA: strip it from the confirm response too.
const sanitizeConfirm = <T extends { allocataire?: { matricule?: string } }>(items: T[]): T[] =>
  items.map((item) =>
    item.allocataire
      ? { ...item, allocataire: { ...item.allocataire, matricule: undefined } }
      : item,
  );

const schema = z.object({
  candidateIndex: z.number().int().min(0),
  // INSEE commune code: 5 chars, digits except Corsica (2A/2B). Optional here:
  // the mode 1 form already asked it and stored it in the session.
  residenceInsee: z
    .string()
    .regex(/^\d[\dAB]\d{3}$/)
    .optional(),
  searchItemId: z.number().int().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const pocResult = await loadPocResult();
    if (!pocResult) {
      return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
    }

    const { identity, apiParticulier } = pocResult;
    const body = schema.parse(await request.json());
    const { candidateIndex, searchItemId } = body;

    // The stored residence (mode 1 form) wins; the FC flow provides it per call.
    const residenceInsee = pocResult.residenceInsee ?? body.residenceInsee;
    if (!residenceInsee) {
      return NextResponse.json({ error: 'Commune de résidence manquante.' }, { status: 400 });
    }

    const candidates = listBeneficiaryCandidates(identity, apiParticulier);
    const candidate = candidates[candidateIndex];
    if (!candidate) {
      return NextResponse.json({ error: 'Bénéficiaire inconnu.' }, { status: 400 });
    }

    // keepMatricule: the matricule from the LCA search stays server-side and is
    // forwarded to the confirm call; it is stripped from every JSON response.
    const payload = buildSearchPayload(candidate, residenceInsee);
    let result = await fetchEligible(payload, { keepMatricule: true });

    // CROUS students often have no address on file: retry with the default INSEE
    // code, mirroring the manual eligibility-test flow.
    if (!('message' in result) && result.length === 0 && payload.isFromCrous) {
      result = await fetchEligible(
        { ...payload, recipientResidencePlace: DEFAULT_INSEE_CODE },
        { keepMatricule: true },
      );
    }

    if ('message' in result) {
      return NextResponse.json({ candidate, error: result.message }, { status: 502 });
    }

    const search = result as SearchResponseBodyItem[];

    if (search.length === 0) {
      // No LCA match: fall back to the API Particulier eligibility rules and
      // return the summary of who is eligible (the client shows it with a link
      // to the contact form).
      return NextResponse.json({ candidate, search: [], eligibilitySummary: candidates });
    }

    // Confirm: explicit searchItemId, or automatic when the match is unambiguous.
    const itemToConfirm =
      searchItemId !== undefined
        ? search.find((item) => item.id === searchItemId)
        : search.length === 1
          ? search[0]
          : undefined;

    if (searchItemId !== undefined && !itemToConfirm) {
      return NextResponse.json(
        { candidate, search: sanitizeSearch(search), error: 'Résultat de recherche inconnu.' },
        { status: 400 },
      );
    }

    if (!itemToConfirm) {
      // Several matches: let the client pick one and call back with searchItemId.
      return NextResponse.json({ candidate, search: sanitizeSearch(search) });
    }

    const confirm = await fetchCode(buildConfirmPayload(itemToConfirm, identity, apiParticulier));

    // Code delivered: destroy the session immediately — the personal data has
    // served its purpose, no reason to keep it until the TTL.
    if (Array.isArray(confirm) && confirm.length > 0) {
      await deletePocResult();
    }

    return NextResponse.json({
      candidate,
      search: sanitizeSearch(search),
      confirm: Array.isArray(confirm) ? sanitizeConfirm(confirm) : confirm,
    });
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    }

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('FranceConnect POC eligibility step failed');
      scope.captureException(e);
    });
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
