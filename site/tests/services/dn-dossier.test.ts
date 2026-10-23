/**
 * @jest-environment node
 */

import { getPool } from '@/app/services/database';
import { dnDossierUrl, findDnDossierForSub } from '@/app/services/dn-dossier';

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
