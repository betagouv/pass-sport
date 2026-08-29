export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

let clientPromise: Promise<RedisLike> | null = null;

export const getRedis = (): Promise<RedisLike> => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = process.env.SCALINGO_REDIS_URL;
      if (!url) {
        throw new Error('SCALINGO_REDIS_URL is missing');
      }
      const { default: Redis } = await import('ioredis');
      return new Redis(url) as unknown as RedisLike;
    })();
  }

  return clientPromise;
};
