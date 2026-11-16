import { DASHBOARD_URL_PATTERN, maskDashboardKey } from '@/utils/dashboard-url';

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345-_6789';

describe('maskDashboardKey', () => {
  it('masks the key, keeping the query string', () => {
    expect(maskDashboardKey(`https://example.test/tableau-de-bord/${KEY}?pas=jour`)).toBe(
      'https://example.test/tableau-de-bord/***?pas=jour',
    );
  });

  it('leaves the other URLs alone', () => {
    expect(maskDashboardKey('https://example.test/v2/accueil')).toBe(
      'https://example.test/v2/accueil',
    );
  });
});

describe('DASHBOARD_URL_PATTERN', () => {
  it.each([
    ['/tableau-de-bord', true],
    [`/tableau-de-bord/${KEY}`, true],
    ['/tableau-de-bordx', false],
    ['/v2/accueil', false],
  ])('%s → %s', (path, expected) => {
    expect(DASHBOARD_URL_PATTERN.test(path)).toBe(expected);
  });
});
