/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

jest.mock('server-only', () => ({}));

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345-_6789';

const get = (path: string) => proxy(new NextRequest(`https://pass-sport.test${path}`));

const rewrittenToNotFound = (response: Response) =>
  response.status === 404 &&
  response.headers.get('x-middleware-rewrite') === 'https://pass-sport.test/v2/not-found';

describe('proxy, dashboard', () => {
  const original = process.env.DASHBOARD_URL_KEY;

  beforeEach(() => {
    process.env.DASHBOARD_URL_KEY = KEY;
  });

  afterEach(() => {
    process.env.DASHBOARD_URL_KEY = original;
  });

  it('serves the dashboard at its key, with headers that keep the URL to itself', () => {
    const response = get(`/tableau-de-bord/${KEY}?pas=semaine`);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it.each([
    '/tableau-de-bord',
    '/tableau-de-bord/',
    '/tableau-de-bord/faux',
    `/tableau-de-bord/${KEY.slice(0, -1)}`,
    `/tableau-de-bord/${KEY}/autre`,
  ])('answers 404 at %s', (path) => {
    expect(rewrittenToNotFound(get(path))).toBe(true);
  });

  it('answers 404 at the key itself when no key is configured', () => {
    delete process.env.DASHBOARD_URL_KEY;
    expect(rewrittenToNotFound(get(`/tableau-de-bord/${KEY}`))).toBe(true);
  });

  it('leaves the other pages alone', () => {
    const response = get('/v2/une-question');

    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBeNull();
  });
});
