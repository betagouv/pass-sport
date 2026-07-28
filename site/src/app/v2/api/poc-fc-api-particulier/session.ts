import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { getRedis } from '@/app/services/redis';
import { PocResult, sessionCookieOptions } from '@/app/v2/api/poc-fc-api-particulier/shared';

export const POC_SESSION_COOKIE = 'fc_poc_session';

// Personal data retention (keep it short):
// - fixed 10-minute Redis TTL, aligned with the session id cookie
//   (sessionCookieOptions maxAge) — the whole journey must fit within it;
// - the session is destroyed as soon as the code is delivered (delete-on-success
//   in the eligibility route) or on logout, without waiting for the TTL.
const SESSION_TTL_SECONDS = 600;

const redisKey = (sessionId: string): string => `poc:fc:session:${sessionId}`;

// Stores the result under a fresh random id and sets the session cookie.
export const storePocResult = async (result: PocResult): Promise<void> => {
  const sessionId = crypto.randomUUID();
  const redis = await getRedis();

  await redis.set(redisKey(sessionId), JSON.stringify(result), 'EX', SESSION_TTL_SECONDS);

  const cookieStore = await cookies();
  cookieStore.set(POC_SESSION_COOKIE, sessionId, sessionCookieOptions());
};

// Loads the result for the current session cookie. Null when the cookie is
// missing, the session expired, or the payload cannot be parsed.
export const loadPocResult = async (): Promise<(PocResult & { sessionId: string }) | null> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(POC_SESSION_COOKIE)?.value;
  if (!sessionId) {
    return null;
  }

  try {
    const redis = await getRedis();
    const raw = await redis.get(redisKey(sessionId));
    if (!raw) {
      return null;
    }
    return { ...(JSON.parse(raw) as PocResult), sessionId };
  } catch {
    return null;
  }
};

// Deletes the stored result and the session cookie (logout, or as soon as the
// code has been delivered).
export const deletePocResult = async (): Promise<void> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(POC_SESSION_COOKIE)?.value;

  cookieStore.delete(POC_SESSION_COOKIE);

  if (!sessionId) {
    return;
  }

  try {
    const redis = await getRedis();
    await redis.del(redisKey(sessionId));
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setTag('session', 'poc-fc-api-particulier');
      scope.captureMessage('POC session delete failed (Redis unavailable)');
      scope.captureException(e);
    });
  }
};
