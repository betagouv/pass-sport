/**
 * @jest-environment node
 */

import { getPool } from '@/app/services/database';
import { dnDossierUrl, findDnDossierForSub } from '@/app/services/dn-dossier';
import { stableDossierLink } from '@/app/services/dn-dossier-rules';

jest.mock('../../src/app/services/database', () => ({ getPool: jest.fn() }));
jest.mock('@sentry/nextjs', () => ({ withScope: jest.fn() }));

const PREFILL_URL = 'https://demarche.numerique.gouv.fr/commencer/pass-sport?prefill_token=tok-1';

const mockQuery = (impl: () => Promise<unknown>) =>
  (getPool as jest.Mock).mockReturnValue({ query: jest.fn(impl) });

describe('dnDossierUrl', () => {
  it('hands out the prefill URL while nobody claimed the dossier', () => {
    expect(
      dnDossierUrl({ dossier_number: 9001, dossier_url: PREFILL_URL, state: 'prefilled' }),
    ).toBe(PREFILL_URL);
  });

  it.each(['brouillon', 'en_construction', 'accepte'])(
    'points a %s dossier at its owner page, without the token',
    (state) => {
      expect(dnDossierUrl({ dossier_number: 9001, dossier_url: PREFILL_URL, state })).toBe(
        'https://demarche.numerique.gouv.fr/dossiers/9001',
      );
    },
  );
});

describe('stableDossierLink', () => {
  const OWNER_URL = 'https://demarche.numerique.gouv.fr/dossiers/9001';
  const dossier = (state: string, url = OWNER_URL) => ({
    number: 9001,
    state,
    url,
    submittedAt: null,
  });

  it.each(['en_construction', 'en_instruction', 'accepte', 'refuse', 'sans_suite'])(
    'links a %s dossier straight away',
    (state) => {
      expect(stableDossierLink(dossier(state))).toEqual({ number: 9001, url: OWNER_URL });
    },
  );

  it('looks a prefilled dossier up anew: its URL is the key to it', () => {
    expect(stableDossierLink(dossier('prefilled', PREFILL_URL))).toBeNull();
  });

  it('looks a draft up anew: DN may have purged it', () => {
    expect(stableDossierLink(dossier('brouillon'))).toBeNull();
  });

  it('answers null without a dossier', () => {
    expect(stableDossierLink(null)).toBeNull();
  });
});

describe('findDnDossierForSub', () => {
  it('reads the live dossier of the sub', async () => {
    mockQuery(async () => ({
      rows: [
        {
          dossier_number: 9001,
          dossier_url: PREFILL_URL,
          state: 'en_construction',
          submitted_at: new Date('2026-10-20T08:00:00Z'),
        },
      ],
    }));

    await expect(findDnDossierForSub('poc-sub-1')).resolves.toEqual({
      number: 9001,
      state: 'en_construction',
      url: 'https://demarche.numerique.gouv.fr/dossiers/9001',
      submittedAt: '2026-10-20T08:00:00.000Z',
    });
  });

  it('answers null without a dossier', async () => {
    mockQuery(async () => ({ rows: [] }));

    await expect(findDnDossierForSub('poc-sub-1')).resolves.toBeNull();
  });

  it('answers null when the database fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery(async () => {
      throw new Error('connection refused');
    });

    await expect(findDnDossierForSub('poc-sub-1')).resolves.toBeNull();
  });
});
