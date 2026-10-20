/**
 * @jest-environment node
 */

import { isDashboardKey } from '@/app/services/dashboard-access';

jest.mock('server-only', () => ({}));

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345-_6789';

describe('isDashboardKey', () => {
  const original = process.env.DASHBOARD_URL_KEY;

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.DASHBOARD_URL_KEY = original;
    jest.restoreAllMocks();
  });

  it('accepts the configured key', () => {
    process.env.DASHBOARD_URL_KEY = KEY;
    expect(isDashboardKey(KEY)).toBe(true);
  });

  it('rejects another key, even of the same length', () => {
    process.env.DASHBOARD_URL_KEY = KEY;
    expect(isDashboardKey(`${KEY.slice(0, -1)}X`)).toBe(false);
    expect(isDashboardKey(KEY.slice(0, -1))).toBe(false);
    expect(isDashboardKey(`${KEY}X`)).toBe(false);
    expect(isDashboardKey('')).toBe(false);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['too short', 'AbCdEfGhIjKlMnOpQrStUvWxYz01234'],
    ['outside the URL-safe alphabet', `${KEY}/+=`],
  ])('keeps the dashboard closed when the key is %s', (_, key) => {
    if (key === undefined) {
      delete process.env.DASHBOARD_URL_KEY;
    } else {
      process.env.DASHBOARD_URL_KEY = key;
    }
    expect(isDashboardKey(key ?? '')).toBe(false);
  });
});
