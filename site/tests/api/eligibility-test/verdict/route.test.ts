/**
 * @jest-environment node
 */

import { fetchCode, fetchEligible } from '@/app/services/eligibility-test';
import { enqueueLcaJob } from '@/app/services/queue';
import { POST } from '@/app/api/eligibility-test/verdict/route';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';
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

jest.mock('../../../../src/app/api/eligibility-test/verdict/generate-pdf-buffer', () => ({
  generatePdfBuffer: jest.fn(),
}));

const mockedFetchEligible = fetchEligible as jest.Mock;
const mockedFetchCode = fetchCode as jest.Mock;
const mockedEnqueue = enqueueLcaJob as jest.Mock;
const mockedGeneratePdf = generatePdfBuffer as jest.Mock;

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
  recipientLastname: 'DUPOND',
  recipientFirstname: 'BABETTE',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGeneratePdf.mockResolvedValue(Buffer.from('pdf'));
});

describe('POST /api/eligibility-test/verdict', () => {
  it('returns 400 when a beneficiary field is missing', async () => {
    const { beneficiaryLastname: _omitted, ...incomplete } = YOUNG_MSA_REQUEST;

    const response = await post(incomplete);

    expect(response.status).toEqual(400);
    expect(mockedFetchEligible).not.toHaveBeenCalled();
  });

  it('chains search and confirm, and answers with the code', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    const response = await post(YOUNG_MSA_REQUEST);

    expect(response.status).toEqual(200);
    expect(await response.json()).toEqual({
      outcome: 'code',
      code: '24-IIII-IIII',
      beneficiaryLastname: 'DUPOND',
      beneficiaryFirstname: 'MANON',
      pdfBase64: Buffer.from('pdf').toString('base64'),
    });

    // The confirm is issued with the id the search returned, which is the whole point of
    // doing both in one request.
    expect(mockedFetchCode).toHaveBeenCalledWith(expect.objectContaining({ id: '123' }));
  });

  it('never returns the matricule nor the allocataire held by LCA', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    const response = await post(YOUNG_MSA_REQUEST);
    const raw = JSON.stringify(await response.json());

    expect(raw).not.toContain('9999999999999');
    expect(raw).not.toContain('fake_email@test.fr');
    expect(raw).not.toContain('BABETTE');
  });

  it('mails the code to the address LCA holds for the allocataire', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());
    mockedFetchCode.mockResolvedValueOnce(buildConfirmResponseBody({}));

    await post(YOUNG_MSA_REQUEST);

    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        lcaStatus: 'confirmed',
        passSportCode: '24-IIII-IIII',
        email: 'fake_email@test.fr',
      }),
    );
  });

  it('answers not_found when LCA knows nobody', async () => {
    mockedFetchEligible.mockResolvedValueOnce([]);

    const response = await post(YOUNG_MSA_REQUEST);

    expect(await response.json()).toEqual({ outcome: 'not_found' });
    expect(mockedFetchCode).not.toHaveBeenCalled();
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ lcaStatus: 'not_found', passSportCode: null }),
    );
  });

  it('answers not_found when the caisse LCA reports contradicts the declared one', async () => {
    mockedFetchEligible.mockResolvedValueOnce(buildSearchResponseBody());

    // The builder answers MSA; this request declares CAF.
    const response = await post({ ...YOUNG_MSA_REQUEST, caisse: 'CAF' });

    expect(await response.json()).toEqual({ outcome: 'not_found' });
    expect(mockedFetchCode).not.toHaveBeenCalled();
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

    expect(await response.json()).toEqual({ outcome: 'error', message: 'gateway is down' });
    expect(mockedEnqueue).toHaveBeenCalledWith(expect.objectContaining({ lcaStatus: 'error' }));
  });
});
