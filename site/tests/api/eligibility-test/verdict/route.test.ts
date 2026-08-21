/**
 * @jest-environment node
 */

import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import { enqueueLcaJob } from '@/app/services/queue';
import { POST } from '@/app/api/eligibility-test/verdict/route';
import {
  buildConfirmResponseBody,
  buildSearchResponseBody,
} from '../../../helpers/builders/confirm-response-body';

jest.mock('../../../../src/app/services/eligibility-test', () => ({
  fetchEligible: jest.fn(),
  fetchCode: jest.fn(),
}));

jest.mock('../../../../src/app/services/queue', () => ({
  enqueueLcaJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
}));

// Reads and writes the visitor's cookies, which only exist inside a real request scope.
jest.mock('../../../../utils/cookie', () => ({
  handleSupportCookie: jest.fn().mockResolvedValue(undefined),
}));

const mockedFetchEligible = fetchEligible as jest.Mock;
const mockedFetchCode = fetchCode as jest.Mock;
const mockedEnqueue = enqueueLcaJob as jest.Mock;

const post = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/eligibility-test/verdict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const YOUNG_MSA_REQUEST = {
  allowanceName: 'QF',
  caisse: 'MSA',
  beneficiaryLastname: 'DUPOND',
  beneficiaryFirstname: 'MANON',
  beneficiaryBirthDate: '2011-01-01',
  recipientResidencePlace: '05024',
  recipientEmail: 'babette@example.test',
  recipientLastname: 'DUPOND',
  recipientFirstname: 'BABETTE',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/eligibility-test/verdict', () => {
  it('returns 400 when a beneficiary field is missing', async () => {
    const { beneficiaryLastname: _omitted, ...incomplete } = YOUNG_MSA_REQUEST;

    const response = await post(incomplete);

    expect(response.status).toEqual(400);
    expect(mockedFetchEligible).not.toHaveBeenCalled();
  });

  it('chains search and confirm, and answers only that the request was processed', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    const response = await post(YOUNG_MSA_REQUEST);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({ outcome: 'sent' });

    // The confirm is issued with the id the search returned, which is the whole point of
    // doing both in one request.
    expect(mockedFetchCode).toHaveBeenCalledWith(expect.objectContaining({ id: '123' }));
  });

  it('answers the same whether LCA holds the beneficiary or not', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));
    const found = await (await post(YOUNG_MSA_REQUEST)).json();

    jest.clearAllMocks();
    mockedFetchEligible.mockResolvedValueOnce([]);
    const unknown = await (await post(YOUNG_MSA_REQUEST)).json();

    // Byte-for-byte identical: this is the last piece of the enumeration oracle.
    expect(found).toEqual(unknown);
  });

  it('never returns the code, the matricule nor the allocataire held by LCA', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    const response = await post(YOUNG_MSA_REQUEST);
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toContain('24-IIII-IIII');
    expect(raw).not.toContain('9999999999999');
    expect(raw).not.toContain('fake_email@test.fr');
    expect(raw).not.toContain('BABETTE');
    expect(raw).not.toContain('MANON');
  });

  it('returns 400 when the collected address is not an email', async () => {
    const response = await post({ ...YOUNG_MSA_REQUEST, recipientEmail: 'babette' });

    expect(response.status).toEqual(400);
    expect(mockedFetchEligible).not.toHaveBeenCalled();
  });

  it('hands the worker both the collected address and the one LCA holds', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    await post(YOUNG_MSA_REQUEST);

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        lcaStatus: 'confirmed',
        passSportCode: '24-IIII-IIII',
        contactEmail: 'babette@example.test',
        email: 'fake_email@test.fr',
      }),
    );
  });

  it('carries the collected address even when LCA knows nobody', async () => {
    mockedFetchEligible.mockResolvedValueOnce([]);

    await post(YOUNG_MSA_REQUEST);

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        lcaStatus: 'not_found',
        contactEmail: 'babette@example.test',
        email: null,
      }),
    );
  });

  it('never sends the collected address to LCA', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    await post(YOUNG_MSA_REQUEST);

    expect(JSON.stringify(mockedFetchEligible.mock.calls)).not.toContain('babette@example.test');
    expect(JSON.stringify(mockedFetchCode.mock.calls)).not.toContain('babette@example.test');
  });

  it('records a not_found when LCA knows nobody', async () => {
    mockedFetchEligible.mockResolvedValueOnce([]);

    const response = await post(YOUNG_MSA_REQUEST);

    expect(await response.json()).toEqual({ outcome: 'sent' });
    expect(mockedFetchCode).not.toHaveBeenCalled();
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ lcaStatus: 'not_found', passSportCode: null }),
    );
  });

  it('records a not_found when the caisse LCA reports contradicts the declared one', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());

    // The builder answers MSA; this request declares CAF.
    const response = await post({ ...YOUNG_MSA_REQUEST, caisse: 'CAF' });

    expect(await response.json()).toEqual({ outcome: 'sent' });
    expect(mockedFetchCode).not.toHaveBeenCalled();
    expect(mockedEnqueue).toHaveBeenCalledWith(expect.objectContaining({ lcaStatus: 'not_found' }));
  });

  it('retries the search on the default INSEE for a boursier with no address on file', async () => {
    mockedFetchEligible
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ...buildSearchResponseBody()[0], situation: 'boursier', organisme: 'cnous' },
      ]);
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    const response = await post({
      ...YOUNG_MSA_REQUEST,
      allowanceName: 'CROUS',
      caisse: null,
      recipientIneNumber: '0000000000X',
    });

    expect(response.status).toEqual(200);
    expect(mockedFetchEligible).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recipientResidencePlace: '75113' }),
      expect.anything(),
    );
  });

  it('still answers, and still records, when LCA is down', async () => {
    mockedFetchEligible.mockResolvedValueOnce({ message: 'gateway is down' });

    const response = await post(YOUNG_MSA_REQUEST);

    // The gateway's own wording never crosses back: an error says nothing but "retry".
    expect(await response.json()).toEqual({ outcome: 'error' });
    expect(mockedEnqueue).toHaveBeenCalledWith(expect.objectContaining({ lcaStatus: 'error' }));
  });
});
