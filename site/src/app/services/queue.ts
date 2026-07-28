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

// The only job kind on the queue.
export const CODES_JOB_NAME = 'france-connect-job';

// Retry schedule: 1min, then 2min, then 3min (4 runs, 6min of backoff total).
// `linear` is NOT a bullmq builtin — it resolves to the custom backoffStrategy the
// worker registers in its Worker settings (worker/src/index.ts). A worker without
// that strategy throws "Unknown backoff strategy linear" when a job fails, so the
// worker must be deployed before/with this.
// removeOnComplete drops the whole job hash the moment the job succeeds: it holds the
// identité pivot, the client IP and the API Particulier answers in clear, and Postgres
// is the record from the moment the rows are committed (which happens before the job
// returns). findJobForSub then answers from applications_by_sub instead, so a returning
// user is still recognised — the worker writes a row for every completed job, including
// ones with no beneficiary, precisely so that fallback is never empty.
// removeOnFail keeps failures for 24h: those still need triage, and their data is the
// only copy left.
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

// State of a returning user's existing request. `null` means nothing on the queue —
// either they never submitted, or the job aged out of the JOB_OPTS retention window
// (which is therefore also the window in which a resubmission is blocked).
export type ExistingJob = {
  id: string;
  // BullMQ states while the job record lives, then 'processed' from the marker the
  // worker leaves behind once the row is committed.
  state: string;
  createdAt: number | undefined;
};

// Looks up a FranceConnect user's job by their pairwise `sub`, which IS the job id.
// Callers must pass the sub from the server-side session, never from request input.
export const findJobForSub = async (sub: string): Promise<ExistingJob | null> => {
  // Fast path: the BullMQ record, which exists while the job is in flight and for
  // the JOB_OPTS retention window after it finishes.
  const job = await getCodesQueue().getJob(sub);
  if (job) {
    return { id: job.id ?? sub, state: await job.getState(), createdAt: job.timestamp };
  }

  // Past that, Postgres is the record: one row per beneficiary, so an application is
  // visible for as long as its rows live. This replaced a derived Redis marker that
  // could go missing while the rows it stood for were committed.
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
