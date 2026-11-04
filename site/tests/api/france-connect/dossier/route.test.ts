/**
 * @jest-environment node
 */

import { loadPocResult } from '@/app/api/france-connect/session';
import { enqueueFcDnDossierJob, findDnDossierJobState } from '@/app/services/queue';
import { findDnDossierForSub } from '@/app/services/dn-dossier';
import { GET, POST } from '@/app/api/france-connect/dossier/route';
import type { PivotIdentity } from '@/app/services/eligibility-job';

jest.mock('../../../../src/app/api/france-connect/session', () => ({
  loadPocResult: jest.fn(),
}));

jest.mock('../../../../src/app/services/queue', () => ({
  enqueueFcDnDossierJob: jest.fn(),
  findDnDossierJobState: jest.fn(),
}));

jest.mock('../../../../src/app/services/dn-dossier', () => ({
  findDnDossierForSub: jest.fn(),
}));

const mockEnv = { FC_DN_DOSSIER_ENABLED: true, FC_DN_DOSSIER_EXISTING_ONLY: false };

// Getters because the factory runs before mockEnv is initialised.
jest.mock('../../../../src/app/constants/env', () => ({
  get FC_DN_DOSSIER_ENABLED() {
    return mockEnv.FC_DN_DOSSIER_ENABLED;
  },
  get FC_DN_DOSSIER_EXISTING_ONLY() {
    return mockEnv.FC_DN_DOSSIER_EXISTING_ONLY;
  },
}));

const mockedLoadPocResult = loadPocResult as jest.Mock;
const mockedEnqueue = enqueueFcDnDossierJob as jest.Mock;
const mockedJobState = findDnDossierJobState as jest.Mock;
const mockedFindDnDossierForSub = findDnDossierForSub as jest.Mock;

// Fictional syllable-based identity: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const IDENTITY: PivotIdentity = {
  sub: 'poc-sub-1',
  given_name: 'Velmorak',
  family_name: 'OSTRENYA',
  birthdate: '1990-03-14',
  gender: 'female',
  birthplace: '75056',
  birthcountry: '99100',
  email: 'velmorak.ostrenya@example.test',
};

const DOSSIER = {
  number: 9001,
  state: 'prefilled',
  url: 'https://demarche.numerique.gouv.fr/commencer/pass-sport?prefill_token=tok-1',
  submittedAt: null,
};

const authenticate = () =>
  mockedLoadPocResult.mockResolvedValue({
    sub: IDENTITY.sub,
    identity: IDENTITY,
    idToken: 'id-token',
    sessionId: 'session-1',
  });

const post = () =>
  POST(
    new Request('http://localhost/api/france-connect/dossier', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'jest' },
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.FC_DN_DOSSIER_ENABLED = true;
  mockEnv.FC_DN_DOSSIER_EXISTING_ONLY = false;
  mockedFindDnDossierForSub.mockResolvedValue(null);
  mockedEnqueue.mockResolvedValue({ queued: true });
  mockedJobState.mockResolvedValue(null);
});

// Cacher le bouton ne ferme pas l'endpoint : le drapeau coupe avant la session et la file.
describe('fonctionnalité éteinte', () => {
  it.each([
    ['POST', post],
    ['GET', () => GET()],
  ])('%s répond 404 sans rien interroger', async (_method, call) => {
    mockEnv.FC_DN_DOSSIER_ENABLED = false;
    authenticate();

    const response = await call();

    expect(response.status).toBe(404);
    expect(mockedLoadPocResult).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
    expect(mockedJobState).not.toHaveBeenCalled();
  });
});

// Le bouton caché aux usagers sans dossier : l'endpoint ne leur en crée pas non plus.
describe('réservée aux usagers ayant déjà un dossier', () => {
  beforeEach(() => {
    mockEnv.FC_DN_DOSSIER_EXISTING_ONLY = true;
    authenticate();
  });

  it('POST répond 403 sans rien mettre en file quand l’usager n’a aucun dossier', async () => {
    const response = await post();

    expect(response.status).toBe(403);
    expect(mockedFindDnDossierForSub).toHaveBeenCalledWith('poc-sub-1');
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it.each(['prefilled', 'brouillon', 'en_construction', 'accepte'])(
    'POST rend son dossier %s à l’usager qui en a déjà un',
    async (state) => {
      mockedFindDnDossierForSub.mockResolvedValue({ ...DOSSIER, state });

      const response = await post();

      expect(response.status).toBe(202);
      expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    },
  );
});

describe('POST /api/france-connect/dossier', () => {
  it('rejects an unauthenticated caller before touching the queue', async () => {
    mockedLoadPocResult.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(401);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it('queues the session identity, keyed on the session sub, and nothing else of it', async () => {
    authenticate();

    const response = await post();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ queued: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mockedEnqueue).toHaveBeenCalledWith(
      {
        identity: {
          sub: 'poc-sub-1',
          family_name: 'OSTRENYA',
          given_name: 'Velmorak',
          birthdate: '1990-03-14',
          gender: 'female',
        },
        clientIp: '203.0.113.7',
        userAgent: 'jest',
      },
      'poc-sub-1',
    );
  });

  it('accepts a click while a job already runs, without queuing another', async () => {
    authenticate();
    mockedEnqueue.mockResolvedValue({ queued: false });

    const response = await post();

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ queued: false });
  });

  it('answers 500 without detail when the queue fails', async () => {
    authenticate();
    mockedEnqueue.mockRejectedValue(new Error('redis down at 10.0.0.3'));

    const response = await post();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Erreur interne.' });
  });
});

describe('GET /api/france-connect/dossier', () => {
  it('rejects an unauthenticated caller', async () => {
    mockedLoadPocResult.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
    expect(mockedJobState).not.toHaveBeenCalled();
  });

  it.each([
    ['live', { status: 'pending' }],
    ['failed', { status: 'failed' }],
  ])('reads a %s job as %j', async (state, body) => {
    authenticate();
    mockedJobState.mockResolvedValue(state);

    const response = await GET();

    await expect(response.json()).resolves.toEqual(body);
    expect(mockedJobState).toHaveBeenCalledWith('poc-sub-1');
    expect(mockedFindDnDossierForSub).not.toHaveBeenCalled();
  });

  it('hands out the dossier once the job is done, never cached', async () => {
    authenticate();
    mockedFindDnDossierForSub.mockResolvedValue(DOSSIER);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ status: 'ready', dossier: DOSSIER });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mockedFindDnDossierForSub).toHaveBeenCalledWith('poc-sub-1');
  });

  it('answers none when there is neither a job nor a dossier', async () => {
    authenticate();

    await expect((await GET()).json()).resolves.toEqual({ status: 'none' });
  });
});
