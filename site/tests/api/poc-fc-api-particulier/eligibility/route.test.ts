/**
 * @jest-environment node
 */

import { POST } from '@/app/v2/api/poc-fc-api-particulier/eligibility/route';
import {
  confirmBeneficiary,
  searchBeneficiary,
} from '@/app/v2/api/poc-fc-api-particulier/lca-client';
import { deletePocResult, loadPocResult } from '@/app/v2/api/poc-fc-api-particulier/session';
import { FranceConnectIdentity } from '@/app/services/france-connect';
import { ApiParticulierResults } from '@/app/services/api-particulier';
import { SearchResponseBodyItem } from 'types/EligibilityTest';
import { buildConfirmResponseBody } from '../../../helpers/builders/confirm-response-body';

jest.mock('../../../../src/app/v2/api/poc-fc-api-particulier/lca-client', () => ({
  searchBeneficiary: jest.fn(),
  confirmBeneficiary: jest.fn(),
}));

jest.mock('../../../../src/app/v2/api/poc-fc-api-particulier/session', () => ({
  loadPocResult: jest.fn(),
  deletePocResult: jest.fn(),
}));

const mockedSearch = searchBeneficiary as jest.Mock;
const mockedConfirm = confirmBeneficiary as jest.Mock;
const mockedLoad = loadPocResult as jest.Mock;
const mockedDelete = deletePocResult as jest.Mock;

// Ages computed at the campaign reference date 2026-12-31 (lca-bridge).
const identity: FranceConnectIdentity = {
  sub: 'fc-sub',
  given_name: 'Jean',
  family_name: 'DUPONT',
  birthdate: '2000-05-10', // 26 ans: AAH (16-30) / CROUS (<28) windows
  birthplace: '75056',
  birthcountry: '99100',
};

const aahRow = {
  resource: 'dss.allocation_adulte_handicape',
  label: 'AAH',
  httpStatus: 200,
  success: true,
  data: { est_beneficiaire: true },
};

const crousRow = {
  resource: 'cnous.etudiant_boursier',
  label: 'CROUS',
  httpStatus: 200,
  success: true,
  data: { statut_boursier: { est_boursier: true } },
};

// Léo: 14 ans → ARS window (12-17). Emma: 5 ans → no eligibility.
const qfRow = {
  resource: 'dss.quotient_familial',
  label: 'Quotient familial',
  httpStatus: 200,
  success: true,
  data: {
    allocataires: [{ nom_usage: 'DUPONT', prenoms: 'Marie' }],
    enfants: [
      { nom_naissance: 'DUPONT', prenoms: 'Léo', date_naissance: '2012-03-01' },
      { nom_naissance: 'DUPONT', prenoms: 'Emma', date_naissance: '2021-06-01' },
    ],
    adresse: {},
    quotient_familial: { valeur: 500, annee: 2026, mois: 1 },
  },
};

const searchItem: SearchResponseBodyItem = {
  id: 900001,
  nom: 'DUPONT',
  prenom: 'LÉO',
  date_naissance: '2012-03-01T00:00:00.000Z',
  situation: 'jeune',
  organisme: 'CAF',
  matricule: '9999999999999',
  hasMatricule: true,
};

const session = (apiParticulier: unknown[], residenceInsee?: string) => ({
  identity,
  apiParticulier: apiParticulier as ApiParticulierResults,
  residenceInsee,
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('POST /v2/api/poc-fc-api-particulier/eligibility', () => {
  it('returns 401 without a session', async () => {
    mockedLoad.mockResolvedValueOnce(null);

    const response = await POST();
    expect(response.status).toEqual(401);
  });

  it('returns 401 before the collect step (no apiParticulier)', async () => {
    mockedLoad.mockResolvedValueOnce({ identity });

    const response = await POST();
    expect(response.status).toEqual(401);
  });

  it('returns 409 when the residence INSEE code is missing from the session', async () => {
    mockedLoad.mockResolvedValueOnce(session([aahRow, qfRow], undefined));

    const response = await POST();
    expect(response.status).toEqual(409);
  });

  it('confirms every beneficiary, strips the matricule and destroys the session', async () => {
    mockedLoad.mockResolvedValueOnce(session([aahRow, qfRow], '29098'));
    mockedSearch.mockResolvedValue([searchItem]);
    mockedConfirm.mockResolvedValue(buildConfirmResponseBody({}));

    const response = await POST();
    expect(response.status).toEqual(200);

    const body = await response.json();
    // Self (AAH) + 2 enfants.
    expect(body.results).toHaveLength(3);
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      'confirmed',
      'confirmed',
      'confirmed',
    ]);
    expect(body.results[0].confirm[0].allocataire.matricule).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('9999999999999');
    expect(mockedDelete).toHaveBeenCalledTimes(1);
  });

  it('skips the connected user without AAH/CROUS but processes every child', async () => {
    mockedLoad.mockResolvedValueOnce(session([qfRow], '29098'));
    mockedSearch.mockResolvedValue([]);

    const response = await POST();
    const body = await response.json();

    expect(body.results).toHaveLength(2);
    expect(body.results[0].candidate.firstname).toEqual('Léo');
    expect(body.results[0].status).toEqual('not_found');
    // ARS window (12-17) → eligible per API Particulier fallback.
    expect(body.results[0].apiParticulierEligible).toEqual(true);
    // Emma (5 ans) → processed anyway, not eligible per the fallback.
    expect(body.results[1].candidate.firstname).toEqual('Emma');
    expect(body.results[1].apiParticulierEligible).toEqual(false);
    // The summary still lists everyone, including the skipped self.
    expect(body.eligibilitySummary).toHaveLength(3);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('keeps processing the batch when one beneficiary fails', async () => {
    mockedLoad.mockResolvedValueOnce(session([aahRow, qfRow], '29098'));
    mockedSearch.mockRejectedValueOnce(new Error('LCA down'));
    mockedSearch.mockResolvedValue([searchItem]);
    mockedConfirm.mockResolvedValue(buildConfirmResponseBody({}));

    const response = await POST();
    const body = await response.json();

    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      'error',
      'confirmed',
      'confirmed',
    ]);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('retries an empty CROUS search with the default INSEE code', async () => {
    mockedLoad.mockResolvedValueOnce(session([crousRow], '29098'));
    mockedSearch.mockResolvedValueOnce([]);
    mockedSearch.mockResolvedValueOnce([
      { ...searchItem, situation: 'boursier', organisme: 'cnous' },
    ]);
    mockedConfirm.mockResolvedValue(buildConfirmResponseBody({}));

    const response = await POST();
    const body = await response.json();

    expect(mockedSearch).toHaveBeenCalledTimes(2);
    expect(mockedSearch.mock.calls[1][0]).toEqual(
      expect.objectContaining({ recipientResidencePlace: '75113' }),
    );
    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toEqual('confirmed');
  });

  it('reports an LCA error body as a per-beneficiary error with the fallback verdict', async () => {
    mockedLoad.mockResolvedValueOnce(session([aahRow], '29098'));
    mockedSearch.mockResolvedValue({ message: 'LCA unavailable' });

    const response = await POST();
    const body = await response.json();

    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toEqual('error');
    expect(body.results[0].apiParticulierEligible).toEqual(true);
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});
