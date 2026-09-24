/**
 * @jest-environment node
 */

import { loadPocResult } from '@/app/api/france-connect/session';
import { enqueueFcRelanceJob, findLiveJobForSub } from '@/app/services/queue';
import {
  findApplicationForSub,
  findLastRelanceForSub,
  findResultsForSub,
} from '@/app/services/applications';
import type { BeneficiaryResult } from '@/app/services/applications';
import { POST } from '@/app/api/france-connect/relance/route';
import type { PivotIdentity } from '@/app/services/eligibility-job';

jest.mock('../../../../src/app/api/france-connect/session', () => ({
  loadPocResult: jest.fn(),
}));

jest.mock('../../../../src/app/services/queue', () => ({
  FC_RELANCE_JOB_NAME: 'fc-relance-job',
  findLiveJobForSub: jest.fn(),
  enqueueFcRelanceJob: jest.fn(),
}));

jest.mock('../../../../src/app/services/applications', () => ({
  findApplicationForSub: jest.fn(),
  findLastRelanceForSub: jest.fn(),
  findResultsForSub: jest.fn(),
}));

const mockEnv = {
  FC_RELANCE_ENABLED: true,
  FC_RELANCE_ALLOWLIST_ONLY: false,
  FC_RELANCE_COOLDOWN_DAYS: 2,
};

// Getters because the factory runs before mockEnv is initialised.
jest.mock('../../../../src/app/constants/env', () => ({
  get FC_RELANCE_ENABLED() {
    return mockEnv.FC_RELANCE_ENABLED;
  },
  get FC_RELANCE_ALLOWLIST_ONLY() {
    return mockEnv.FC_RELANCE_ALLOWLIST_ONLY;
  },
  get FC_RELANCE_COOLDOWN_DAYS() {
    return mockEnv.FC_RELANCE_COOLDOWN_DAYS;
  },
}));

const mockedLoadPocResult = loadPocResult as jest.Mock;
const mockedFindLiveJobForSub = findLiveJobForSub as jest.Mock;
const mockedFindLastRelanceForSub = findLastRelanceForSub as jest.Mock;
const mockedFindApplicationForSub = findApplicationForSub as jest.Mock;
const mockedFindResultsForSub = findResultsForSub as jest.Mock;
const mockedEnqueueFcRelanceJob = enqueueFcRelanceJob as jest.Mock;

// Fictional syllable-based identity: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  sub: 'poc-sub-1',
  given_name: 'Velmorak',
  family_name: 'OSTRENYA',
  birthdate: '1990-03-14',
  gender: 'female',
};

const DAY_MS = 86_400_000;

const authenticate = () => {
  mockedLoadPocResult.mockResolvedValue({
    sub: IDENTITY.sub,
    identity: IDENTITY,
    idToken: 'id-token',
    sessionId: 'session-1',
  });
};

const request = (): Request =>
  new Request('http://localhost/api/france-connect/relance', { method: 'POST' });

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.FC_RELANCE_ENABLED = true;
  mockEnv.FC_RELANCE_ALLOWLIST_ONLY = false;
  mockedFindLiveJobForSub.mockResolvedValue(null);
  mockedFindLastRelanceForSub.mockResolvedValue(null);
  mockedFindApplicationForSub.mockResolvedValue(null);
  mockedEnqueueFcRelanceJob.mockResolvedValue({ id: IDENTITY.sub, name: 'fc-relance-job' });
});

// Cacher le bouton ne ferme pas l'endpoint, et c'est l'endpoint qui dépense le quota API
// Particulier. Le drapeau doit donc couper AVANT la session et avant la file.
describe('POST /api/france-connect/relance, fonctionnalité éteinte', () => {
  it('répond 404 sans rien interroger', async () => {
    mockEnv.FC_RELANCE_ENABLED = false;
    authenticate();

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mockedLoadPocResult).not.toHaveBeenCalled();
    expect(mockedFindLiveJobForSub).not.toHaveBeenCalled();
    expect(mockedFindLastRelanceForSub).not.toHaveBeenCalled();
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });
});

describe('POST /api/france-connect/relance', () => {
  it('rejects an unauthenticated caller before touching the queue', async () => {
    mockedLoadPocResult.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockedFindLiveJobForSub).not.toHaveBeenCalled();
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });

  it('refuses while any job is in flight for this usager, whatever its kind', async () => {
    authenticate();
    mockedFindLiveJobForSub.mockResolvedValue({ id: IDENTITY.sub, state: 'active', createdAt: 1 });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mockedFindLastRelanceForSub).not.toHaveBeenCalled();
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });

  it('refuses inside the quota window and names the date it comes back', async () => {
    authenticate();
    const lastRelance = new Date(Date.now() - DAY_MS);
    mockedFindLastRelanceForSub.mockResolvedValue(lastRelance);

    const response = await POST(request());
    const body = (await response.json()) as { availableAt: string };

    expect(response.status).toBe(429);
    expect(new Date(body.availableAt).getTime()).toBe(lastRelance.getTime() + 2 * DAY_MS);
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });

  it('refuses inside the window that follows the last run, even without any relance', async () => {
    authenticate();
    const lastApplication = new Date(Date.now() - DAY_MS);
    mockedFindApplicationForSub.mockResolvedValue({
      firstApplication: lastApplication,
      lastApplication,
    });

    const response = await POST(request());
    const body = (await response.json()) as { availableAt: string };

    expect(response.status).toBe(429);
    expect(new Date(body.availableAt).getTime()).toBe(lastApplication.getTime() + 2 * DAY_MS);
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });

  it('counts from the later of the last relance and the last run', async () => {
    authenticate();
    const lastApplication = new Date(Date.now() - 5 * DAY_MS);
    const lastRelance = new Date(Date.now() - DAY_MS);
    mockedFindApplicationForSub.mockResolvedValue({
      firstApplication: lastApplication,
      lastApplication,
    });
    mockedFindLastRelanceForSub.mockResolvedValue(lastRelance);

    const body = (await (await POST(request())).json()) as { availableAt: string };

    expect(new Date(body.availableAt).getTime()).toBe(lastRelance.getTime() + 2 * DAY_MS);
  });

  it('accepts once the window has elapsed', async () => {
    authenticate();
    mockedFindLastRelanceForSub.mockResolvedValue(new Date(Date.now() - 5 * DAY_MS));

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ queued: true });
  });

  it('never accepts a caller-supplied identifier: the sub always comes from the session', async () => {
    authenticate();

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mockedEnqueueFcRelanceJob).toHaveBeenCalledWith(
      expect.objectContaining({ identity: IDENTITY, isFranceConnected: true }),
      IDENTITY.sub,
    );
  });

  // BullMQ hands back the EXISTING job when the id is taken, so the name is the only evidence
  // that nothing was enqueued.
  it('answers 409 rather than a lying 202 when a demande took the id in between', async () => {
    authenticate();
    mockedEnqueueFcRelanceJob.mockResolvedValue({
      id: IDENTITY.sub,
      name: 'france-connect-job',
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
  });

  it('returns 500 without leaking details when the queue itself throws', async () => {
    authenticate();
    mockedEnqueueFcRelanceJob.mockRejectedValue(new Error('redis exploded'));

    const response = await POST(request());
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).not.toContain('redis exploded');
  });
});

describe('POST /api/france-connect/relance, restreinte à la liste de test', () => {
  const refusal = (relanceAllowed: boolean): BeneficiaryResult => ({
    source: 'self',
    givenName: null,
    familyName: null,
    birthdate: null,
    gender: null,
    verdict: 'not_eligible',
    code: null,
    relanceAllowed,
  });

  beforeEach(() => {
    mockEnv.FC_RELANCE_ALLOWLIST_ONLY = true;
    authenticate();
  });

  it('répond 403 quand aucun refus n’est autorisé, sans toucher la file', async () => {
    mockedFindResultsForSub.mockResolvedValue([refusal(false)]);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockedFindResultsForSub).toHaveBeenCalledWith(IDENTITY.sub);
    expect(mockedEnqueueFcRelanceJob).not.toHaveBeenCalled();
  });

  it('accepte quand un refus est autorisé', async () => {
    mockedFindResultsForSub.mockResolvedValue([refusal(false), refusal(true)]);

    const response = await POST(request());

    expect(response.status).toBe(202);
  });

  it('accepte un foyer autorisé déjà éligible', async () => {
    mockedFindResultsForSub.mockResolvedValue([{ ...refusal(true), verdict: 'eligible_pending' }]);

    const response = await POST(request());

    expect(response.status).toBe(202);
  });

  it('ne lit pas les résultats quand le drapeau est baissé', async () => {
    mockEnv.FC_RELANCE_ALLOWLIST_ONLY = false;

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mockedFindResultsForSub).not.toHaveBeenCalled();
  });
});
