import { getRedis } from '@/app/services/redis';

const WINDOW_S = Number(process.env.ABUSE_WINDOW_S ?? 3600);
const MAX_REQUESTS = Number(process.env.ABUSE_MAX_REQUESTS_PER_IP ?? 10);

export interface AbuseCheck {
  blocked: boolean;
  requestCount: number;
}

// Atomic fixed-window counter: increment the IP's count, arm the TTL on first hit, return whether
// the count now exceeds the threshold.
const CHECK_LUA = `
local key     = KEYS[1]
local windowS = tonumber(ARGV[1])
local maxReq  = tonumber(ARGV[2])

local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, windowS)
end

local blocked = 0
if count > maxReq then blocked = 1 end
return { blocked, count }
`;

interface EvalRedis {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

// Records one request from this IP and reports whether the IP has crossed the volume threshold.
// If the client IP is unknown we cannot attribute abuse, so we allow and report 0.
export const checkHarvesting = async (clientIp: string | null): Promise<AbuseCheck> => {
  if (!clientIp) {
    return { blocked: false, requestCount: 0 };
  }

  const redis = (await getRedis()) as unknown as EvalRedis;
  const [blocked, count] = (await redis.eval(
    CHECK_LUA,
    1,
    `abuse:ip:${clientIp}`,
    WINDOW_S,
    MAX_REQUESTS,
  )) as [number, number];

  return { blocked: blocked === 1, requestCount: count };
};
