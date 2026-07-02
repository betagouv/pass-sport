// Lazy singleton Redis client (Scalingo Redis addon provides REDIS_URL).
// Used by the API Particulier rate limiter (counters) and the POC FC session
// store (short-lived personal data keyed by a random session id, TTL'd).

import type { RedisLike } from '@/app/services/rate-limiter';

let clientPromise: Promise<RedisLike> | null = null;

export const getRedis = (): Promise<RedisLike> => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = process.env.REDIS_URL;
      if (!url) {
        throw new Error('REDIS_URL is missing');
      }
      const { default: Redis } = await import('ioredis');
      return new Redis(url) as unknown as RedisLike;
    })();
  }

  return clientPromise;
};
