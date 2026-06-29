// Distributed token-bucket rate limiter for API Particulier (hard limit: 20 req/s global).
// State lives in Redis so the limit holds across all autoscaled Scalingo containers.
// Redis stores ONLY counters/timestamps — never any confidential data.
//
// The acquire is a single atomic Lua script (read -> lazy refill -> conditional decrement ->
// write) so concurrent containers can't both grab the last token (check-then-act race).

export interface RedisLike {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export class RateLimitedError extends Error {
  constructor(message = 'API Particulier rate limit: max wait exceeded') {
    super(message);
    this.name = 'RateLimitedError';
  }
}

const BUCKET_KEY = 'rl:api-particulier';
// 18/s leaves headroom under the hard 20/s ceiling. Small capacity ~ strict pacing.
const RATE = Number(process.env.API_PARTICULIER_RATE ?? 18);
const CAPACITY = Number(process.env.API_PARTICULIER_BUCKET_CAPACITY ?? 18);
const MAX_WAIT_MS = Number(process.env.API_PARTICULIER_MAX_WAIT_MS ?? 2500);

// Returns { allowed: 0|1, waitMs }. Runs atomically inside Redis.
const ACQUIRE_LUA = `
local key       = KEYS[1]
local rate      = tonumber(ARGV[1])
local capacity  = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local state  = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1])
local ts     = tonumber(state[2])

if tokens == nil then
  tokens = capacity
  ts     = now
end

local elapsed = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + elapsed * rate)

local allowed = 0
local wait    = 0
if tokens >= requested then
  tokens  = tokens - requested
  allowed = 1
else
  wait = math.ceil(((requested - tokens) / rate) * 1000)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil((capacity / rate) * 1000) + 1000)

return { allowed, wait }
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Blocks in-process until a token is free, or throws RateLimitedError past the max wait.
// The request payload never leaves this container only the counter lives in Redis.
export const acquireToken = async (redis: RedisLike): Promise<void> => {
  const start = Date.now();

  for (;;) {
    const [allowed, waitMs] = (await redis.eval(
      ACQUIRE_LUA,
      1,
      BUCKET_KEY,
      RATE,
      CAPACITY,
      Date.now(),
      1,
    )) as [number, number];

    if (allowed === 1) {
      return;
    }

    if (Date.now() - start + waitMs > MAX_WAIT_MS) {
      throw new RateLimitedError();
    }

    // Add a small random delay so callers that were denied don't all retry at the same
    // instant and collide again.
    const randomDelayMs = Math.floor(Math.random() * 20);

    await sleep(waitMs + randomDelayMs);
  }
};
