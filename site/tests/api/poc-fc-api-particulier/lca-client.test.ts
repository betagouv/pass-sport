/**
 * @jest-environment node
 */

import {
  confirmBeneficiary,
  searchBeneficiary,
} from '@/app/v2/api/poc-fc-api-particulier/lca-client';
import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { ConfirmPayload, SearchPayload, SearchResponseBodyItem } from 'types/EligibilityTest';
import { buildConfirmResponseBody } from '../../helpers/builders/confirm-response-body';

jest.mock('../../../src/app/services/eligibility-test', () => ({
  fetchEligible: jest.fn(),
  fetchCode: jest.fn(),
}));

const mockedFetchEligible = fetchEligible as jest.Mock;
const mockedFetchCode = fetchCode as jest.Mock;

const searchPayload: SearchPayload = {
  beneficiaryLastname: 'Dupont',
  beneficiaryFirstname: 'Léo',
  beneficiaryBirthDate: '2012-03-01',
  recipientResidencePlace: '29098',
  allowanceName: ALLOWANCE.ARS,
  isFromCrous: false,
};

const confirmPayload: ConfirmPayload = {
  id: '900001',
  situation: 'jeune',
  organisme: 'CAF',
  recipientLastname: 'DUPONT',
  recipientFirstname: 'MARIE',
  recipientBirthDate: '1980-01-01',
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

const originalFlag = process.env.LCA_API_ENABLED;

afterEach(() => {
  jest.clearAllMocks();
  if (originalFlag === undefined) {
    delete process.env.LCA_API_ENABLED;
  } else {
    process.env.LCA_API_ENABLED = originalFlag;
  }
});

describe('lca-client with LCA_API_ENABLED disabled', () => {
  beforeEach(() => {
    delete process.env.LCA_API_ENABLED;
  });

  it('mocks the search without calling the real API, echoing the beneficiary', async () => {
    const result = await searchBeneficiary(searchPayload);

    expect(mockedFetchEligible).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        nom: 'DUPONT',
        prenom: 'LÉO',
        date_naissance: '2012-03-01T00:00:00.000Z',
        situation: 'jeune',
        organisme: 'CAF',
        hasMatricule: true,
      }),
    ]);
  });

  it('mocks a boursier/cnous item for a CROUS beneficiary', async () => {
    const result = await searchBeneficiary({
      ...searchPayload,
      allowanceName: ALLOWANCE.CROUS,
      isFromCrous: true,
    });

    expect(result).toEqual([
      expect.objectContaining({ situation: 'boursier', organisme: 'cnous' }),
    ]);
  });

  it('mocks an AAH item for an AAH beneficiary', async () => {
    const result = await searchBeneficiary({
      ...searchPayload,
      allowanceName: ALLOWANCE.AAH,
    });

    expect(result).toEqual([expect.objectContaining({ situation: 'AAH', organisme: 'CAF' })]);
  });

  it('mocks the confirm without calling the real API, echoing the search item', async () => {
    const result = await confirmBeneficiary(confirmPayload, searchItem);

    expect(mockedFetchCode).not.toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id: 900001,
        id_psp: '26-MOCK-900001',
        nom: 'DUPONT',
        prenom: 'LÉO',
        situation: 'jeune',
        organisme: 'CAF',
      }),
    ]);
  });

  it('is deterministic', async () => {
    expect(await searchBeneficiary(searchPayload)).toEqual(await searchBeneficiary(searchPayload));
    expect(await confirmBeneficiary(confirmPayload, searchItem)).toEqual(
      await confirmBeneficiary(confirmPayload, searchItem),
    );
  });
});

describe('lca-client with LCA_API_ENABLED="true"', () => {
  beforeEach(() => {
    process.env.LCA_API_ENABLED = 'true';
  });

  it('delegates the search to fetchEligible keeping the matricule server-side', async () => {
    mockedFetchEligible.mockResolvedValueOnce([searchItem]);

    const result = await searchBeneficiary(searchPayload);

    expect(mockedFetchEligible).toHaveBeenCalledWith(searchPayload, { keepMatricule: true });
    expect(result).toEqual([searchItem]);
  });

  it('delegates the confirm to fetchCode', async () => {
    const confirmBody = buildConfirmResponseBody({});
    mockedFetchCode.mockResolvedValueOnce(confirmBody);

    const result = await confirmBeneficiary(confirmPayload, searchItem);

    expect(mockedFetchCode).toHaveBeenCalledWith(confirmPayload);
    expect(result).toEqual(confirmBody);
  });
});
