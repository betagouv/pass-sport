// Lazy singleton Redis client (Scalingo Redis addon provides REDIS_URL).
// Used only by the API Particulier rate limiter — stores counters, never confidential data.

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
