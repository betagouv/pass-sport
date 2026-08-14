/**
 * @jest-environment node
 */

import { POST } from '@/app/v2/api/api-particulier/collect/route';
import { enqueueEmailVerificationJob, findApiParticulierJob } from '@/app/services/queue';
import { findResultForJobId } from '@/app/services/applications';

// The queue module pulls in BullMQ (ESM-only deps) and opens a Redis connection on import,
// so it is replaced wholesale rather than partially — only the two functions the route uses
// need to exist. apiParticulierJobId comes from eligibility-job, which stays real.
jest.mock('../../../../src/app/services/queue', () => ({
  ...jest.requireActual('../../../../src/app/services/eligibility-job'),
  enqueueEmailVerificationJob: jest.fn(),
  findApiParticulierJob: jest.fn(),
}));

jest.mock('../../../../src/app/services/applications', () => ({
  findResultForJobId: jest.fn(),
}));

// Writes a cookie through next/headers, which has no request context under Jest.
jest.mock('../../../../utils/cookie', () => ({
  handleSupportCookie: jest.fn(),
}));

const mockedEnqueue = enqueueEmailVerificationJob as jest.Mock;
const mockedFindJob = findApiParticulierJob as jest.Mock;
const mockedFindResult = findResultForJobId as jest.Mock;

const validForm = (overrides: Record<string, string> = {}): FormData => {
  const form = new FormData();
  const fields: Record<string, string> = {
    beneficiaryLastname: 'Martin',
    beneficiaryFirstname: 'Cadet',
    beneficiaryBirthDate: '2012-01-01',
    recipientResidencePlace: '75113',
    allowanceName: 'QF',
    caisse: 'CAF',
    recipientLastname: 'Martin',
    recipientFirstname: 'Claude',
    recipientGenre: 'F',
    recipientBirthDate: '1980-03-02',
    recipientBirthCountry: 'FR',
    recipientBirthPlace: '75056',
    recipientCafNumber: '1234567',
    email: 'claude.martin@example.test',
    ...overrides,
  };
  Object.entries(fields).forEach(([key, value]) => form.set(key, value));
  return form;
};

const post = (form: FormData): Promise<Response> =>
  POST(
    new Request('http://localhost/v2/api/api-particulier/collect', { method: 'POST', body: form }),
  );

describe('POST /v2/api/api-particulier/collect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindJob.mockResolvedValue(null);
    mockedEnqueue.mockResolvedValue({ id: 'queued' });
    mockedFindResult.mockResolvedValue(null);
  });

  it('enqueues a verification job instead of the eligibility job', async () => {
    const response = await post(validForm());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ queued: true, pendingVerification: true });

    // The whole payload is parked, so the click has everything it needs to replay it.
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        aide: 'QF',
        caisse: 'CAF',
        email: 'claude.martin@example.test',
        residenceInsee: '75113',
        beneficiary: { lastname: 'Martin', firstname: 'Cadet', birthdate: '2012-01-01' },
      }),
    );
  });

  it('does not mail anything when the request is already in flight', async () => {
    mockedFindJob.mockResolvedValue({ id: 'abc', state: 'active', createdAt: Date.now() });

    const response = await post(validForm());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ alreadyQueued: true, state: 'active' });
    expect(mockedEnqueue).not.toHaveBeenCalled();
    // Nothing has been sent yet, so there is no mailbox to name.
    expect(mockedFindResult).not.toHaveBeenCalled();
  });

  it('names the masked mailbox when the request was already processed', async () => {
    mockedFindJob.mockResolvedValue({ id: 'abc', state: 'processed', createdAt: Date.now() });
    mockedFindResult.mockResolvedValue({ emailMask: 'c***e@example.test', emailSent: true });

    const response = await post(validForm());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ sentTo: 'c***e@example.test' });
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before anything is queued', async () => {
    const response = await post(validForm({ email: 'not-an-address' }));

    expect(response.status).toBe(400);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});
