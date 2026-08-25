/**
 * @jest-environment node
 */

import { loadPocResult } from '@/app/api/france-connect/session';
import { findResultsForSub } from '@/app/services/applications';
import { generatePdfBuffer } from '@/app/api/eligibility-test/verdict/generate-pdf-buffer';
import { GET } from '@/app/api/france-connect/pdf/route';
import type { BeneficiaryResult } from '@/app/services/applications';
import type { PivotIdentity } from '@/app/services/eligibility-job';

jest.mock('../../../../src/app/api/france-connect/session', () => ({
  loadPocResult: jest.fn(),
}));

jest.mock('../../../../src/app/services/applications', () => ({
  findResultsForSub: jest.fn(),
}));

jest.mock('../../../../src/app/api/eligibility-test/verdict/generate-pdf-buffer', () => ({
  generatePdfBuffer: jest.fn(),
}));

const mockedLoadPocResult = loadPocResult as jest.Mock;
const mockedFindResultsForSub = findResultsForSub as jest.Mock;
const mockedGeneratePdfBuffer = generatePdfBuffer as jest.Mock;

// Fictional syllable-based identity: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  sub: 'poc-sub-1',
  given_name: 'Velmorak',
  family_name: 'OSTRENYA',
  birthdate: '1990-03-14',
  gender: 'female',
};

const authenticate = (identity: Partial<PivotIdentity> = IDENTITY) => {
  mockedLoadPocResult.mockResolvedValue({
    sub: identity.sub ?? IDENTITY.sub,
    identity: { ...IDENTITY, ...identity },
    idToken: 'id-token',
    sessionId: 'session-1',
  });
};

const result = (overrides: Partial<BeneficiaryResult> = {}): BeneficiaryResult => ({
  source: 'self',
  givenName: null,
  verdict: 'eligible_confirmed',
  code: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedGeneratePdfBuffer.mockResolvedValue(Buffer.from('pdf-bytes'));
});

describe('GET /api/france-connect/pdf', () => {
  it('rejects an unauthenticated caller before looking anything up', async () => {
    mockedLoadPocResult.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockedFindResultsForSub).not.toHaveBeenCalled();
    expect(mockedGeneratePdfBuffer).not.toHaveBeenCalled();
  });

  it('never accepts a caller-supplied identifier: the sub always comes from the session', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([result({ code: '24-ZORV-QYXA' })]);

    await GET();

    expect(mockedFindResultsForSub).toHaveBeenCalledWith(IDENTITY.sub);
    expect(mockedFindResultsForSub).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the authenticated allocataire has no confirmed code', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([result({ verdict: 'eligible_pending' })]);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mockedGeneratePdfBuffer).not.toHaveBeenCalled();
  });

  it('never surfaces an eligible_pending_lca code, even though the column may already hold one', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([
      result({ verdict: 'eligible_pending_lca', code: '24-WOLX-TREP' }),
    ]);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mockedGeneratePdfBuffer).not.toHaveBeenCalled();
  });

  it('ignores an enfant row entirely, even one with a confirmed code', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([
      result({
        source: 'enfant',
        givenName: 'Zephyrin',
        verdict: 'eligible_confirmed',
        code: '24-AZUR-KLMB',
      }),
    ]);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mockedGeneratePdfBuffer).not.toHaveBeenCalled();
  });

  it('returns 422 when the session identity is missing the fields a document requires', async () => {
    authenticate({ family_name: undefined });
    mockedFindResultsForSub.mockResolvedValue([result({ code: '24-ZORV-QYXA' })]);

    const response = await GET();

    expect(response.status).toBe(422);
    expect(mockedGeneratePdfBuffer).not.toHaveBeenCalled();
  });

  it('builds the PDF from the session identity and the self code, never from request input', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([
      result({ verdict: 'eligible_pending_lca', code: '24-WOLX-TREP' }),
      result({ code: '24-ZORV-QYXA' }),
    ]);

    const response = await GET();

    expect(mockedGeneratePdfBuffer).toHaveBeenCalledWith({
      firstname: 'Velmorak',
      lastname: 'OSTRENYA',
      dob: '1990-03-14',
      code: '24-ZORV-QYXA',
      gender: 'F',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="pass-sport-24-ZORV-QYXA.pdf"',
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe('pdf-bytes');
  });

  it('maps a male session identity to the "M" gender the PDF template expects', async () => {
    authenticate({ gender: 'male' });
    mockedFindResultsForSub.mockResolvedValue([result({ code: '24-ZORV-QYXA' })]);

    await GET();

    expect(mockedGeneratePdfBuffer).toHaveBeenCalledWith(expect.objectContaining({ gender: 'M' }));
  });

  it('returns 500 without leaking details when PDF generation itself throws', async () => {
    authenticate();
    mockedFindResultsForSub.mockResolvedValue([result({ code: '24-ZORV-QYXA' })]);
    mockedGeneratePdfBuffer.mockRejectedValue(new Error('renderer exploded'));

    const response = await GET();

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).not.toContain('renderer exploded');
  });
});
