import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { findApplicationForSub } from '@/app/services/applications';

export const CODES_QUEUE_NAME = 'codes-queue';

// Mirror of the worker's PivotIdentity (src/eligibility/types.ts).
export type PivotIdentity = {
  // FranceConnect pairwise pseudonym. NOT part of the identité pivot — carried purely
  // as a lookup key: opaque, identical across fournisseurs d'identité, and changes
  // only on an état civil modification. Never fed to API Particulier.
  sub?: string;
  family_name: string;
  preferred_username?: string;
  given_name?: string;
  birthdate?: string; // ISO "YYYY-MM-DD"
  gender?: 'male' | 'female';
  birthplace?: string; // code COG INSEE commune de naissance
  birthcountry?: string; // code COG INSEE pays de naissance
  email?: string;
};

// Mirror of the worker's Allowance (src/eligibility/types.ts). 'QF' is the
// "quotient familial < 700" route, which makes the household's 6-17 ans eligible.
export type Allowance = 'AAH' | 'CROUS' | 'AEEH' | 'QF';

// Mirror of the worker's EligibilityJobPayload (src/eligibility/types.ts). This is what
// BullMQ stores verbatim. The worker adds a `checkpoint` field at runtime to resume a
// rate-limited job — producers never send it.
export type EligibilityJobData = {
  identity: PivotIdentity;
  aides: Allowance[];
  isFranceConnected: boolean;
  residenceInsee: string;
  // Originating client IP (right-most x-forwarded-for hop), recorded by the worker
  // in the audit table. null when the request carried no forwarded-for header.
  clientIp?: string | null;
  // Client User-Agent header, recorded by the worker in the audit table.
  userAgent?: string | null;
};

// todo: add another queue for job "api-particulier-job" for the flow without France Connect
export const CODES_JOB_NAME = 'france-connect-job';

const JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'linear' as const, delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
};

// Memoized on globalThis so Next hot reload doesn't leak a new Queue (and its
// dedicated Redis connection) on every module re-evaluation.
type CodesQueue = Queue<EligibilityJobData>;

const globalForQueue = globalThis as unknown as {
  __codesQueue?: CodesQueue;
};

const createConnection = (): IORedis => {
  const url = process.env.SCALINGO_REDIS_URL;
  if (!url) {
    throw new Error('SCALINGO_REDIS_URL is missing');
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
};

export const getCodesQueue = (): CodesQueue => {
  if (!globalForQueue.__codesQueue) {
    globalForQueue.__codesQueue = new Queue<EligibilityJobData>(CODES_QUEUE_NAME, {
      connection: createConnection(),
    });
  }
  return globalForQueue.__codesQueue;
};

export type ExistingJob = {
  id: string;
  state: string;
  createdAt: number | undefined;
};

export const findJobForSub = async (sub: string): Promise<ExistingJob | null> => {
  const job = await getCodesQueue().getJob(sub);
  if (job) {
    return { id: job.id ?? sub, state: await job.getState(), createdAt: job.timestamp };
  }

  const application = await findApplicationForSub(sub);

  if (!application) {
    return null;
  }

  return {
    id: sub,
    state: 'processed',
    createdAt: application.lastApplication.getTime(),
  };
};

export const enqueueCodesJob = async (
  data: EligibilityJobData,
  sub: string,
): Promise<{ id: string | undefined; existing: ExistingJob | null }> => {
  const existing = await findJobForSub(sub);

  if (existing) {
    return { id: existing.id, existing };
  }

  const job = await getCodesQueue().add(CODES_JOB_NAME, data, {
    ...JOB_OPTS,
    jobId: sub,
  });

  return { id: job.id, existing: null };
};
