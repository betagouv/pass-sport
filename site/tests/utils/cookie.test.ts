import crypto from 'crypto';

const KEY = crypto.randomBytes(32).toString('base64');
const COOKIE_NAME = 'support-cookie';

process.env.BASE_64_KEY_FOR_SUPPORT_COOKIE = KEY;
process.env.NEXT_PUBLIC_COOKIE_SUPPORT_KEY = COOKIE_NAME;

const cookieJar = new Map<string, string>();

jest.mock('server-only', () => ({}));
jest.mock('@sentry/nextjs', () => ({ withScope: jest.fn() }));
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

import { encryptAuthenticated } from '@/utils/decryption';
import { AUTHORIZED_VENDORS_KEY } from '@/app/constants/cookie-manager';

const ATTEMPT = { beneficiaryLastname: 'DUPOND', recipientEmail: 'babette@example.test' };
const FRANCE_CONNECT_IDENTITY = {
  allocataire_fc_sub: 'abc123v1',
  recipientLastname: 'DUPOND',
  recipientFirstname: 'BABETTE',
  recipientBirthDate: '1980-03-07',
};

const encryptLegacy = (value: unknown) =>
  encryptAuthenticated(Buffer.from(JSON.stringify(value)).toString('base64'), KEY);

// Dynamic import: utils/cookie reads its env vars at load time, after the assignments above
let supportCookie: typeof import('@/utils/cookie');

describe('support cookie', () => {
  beforeAll(async () => {
    supportCookie = await import('@/utils/cookie');
  });

  beforeEach(() => {
    cookieJar.clear();
    cookieJar.set(AUTHORIZED_VENDORS_KEY, `${COOKIE_NAME}=true`);
  });

  it('still decodes legacy base64-encoded cookies', () => {
    expect(supportCookie.decodeSupportCookie(encryptLegacy([ATTEMPT]))).toEqual({
      attempts: [ATTEMPT],
      franceConnect: null,
    });
    expect(
      supportCookie.decodeSupportCookie(
        encryptLegacy({ attempts: [ATTEMPT], franceConnect: null }),
      ),
    ).toEqual({ attempts: [ATTEMPT], franceConnect: null });
  });

  it('drops the FranceConnect identity on logout but keeps the visit and the attempts', async () => {
    cookieJar.set(COOKIE_NAME, encryptLegacy({ attempts: [ATTEMPT], franceConnect: null }));

    await supportCookie.markFranceConnectInSupportCookie(FRANCE_CONNECT_IDENTITY);
    expect(supportCookie.decodeSupportCookie(cookieJar.get(COOKIE_NAME))?.franceConnect).toEqual(
      expect.objectContaining(FRANCE_CONNECT_IDENTITY),
    );

    await supportCookie.clearFranceConnectIdentityFromSupportCookie();
    expect(supportCookie.decodeSupportCookie(cookieJar.get(COOKIE_NAME))).toEqual({
      attempts: [ATTEMPT],
      franceConnect: {
        connectedAt: expect.any(String),
        disconnectedAt: expect.any(String),
      },
    });
  });

  it('keeps the FranceConnect visit on logout even without any attempt', async () => {
    await supportCookie.markFranceConnectInSupportCookie(FRANCE_CONNECT_IDENTITY);
    await supportCookie.clearFranceConnectIdentityFromSupportCookie();

    expect(supportCookie.decodeSupportCookie(cookieJar.get(COOKIE_NAME))).toEqual({
      attempts: [],
      franceConnect: expect.objectContaining({ disconnectedAt: expect.any(String) }),
    });
  });

  it('removes the cookie on logout when the support consent was withdrawn', async () => {
    await supportCookie.markFranceConnectInSupportCookie(FRANCE_CONNECT_IDENTITY);
    cookieJar.set(AUTHORIZED_VENDORS_KEY, `${COOKIE_NAME}=false`);
    await supportCookie.clearFranceConnectIdentityFromSupportCookie();

    expect(cookieJar.has(COOKIE_NAME)).toBe(false);
  });
});
