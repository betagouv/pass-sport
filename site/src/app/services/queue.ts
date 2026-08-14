import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { findApplicationForJobId, findApplicationForSub } from '@/app/services/applications';
import {
  type ApiParticulierJobData,
  type EligibilityJobData,
  apiParticulierJobId,
} from '@/app/services/eligibility-job';

export type {
  Allowance,
  ApiParticulierJobData,
  EligibilityJobData,
  PivotIdentity,
  Situation,
} from '@/app/services/eligibility-job';
export { ALLOWANCE, SITUATION, apiParticulierJobId } from '@/app/services/eligibility-job';

export const CODES_QUEUE_NAME = 'codes-queue-france-connect';
export const API_PARTICULIER_QUEUE_NAME = 'codes-queue-api-particulier';
export const EMAIL_VERIFICATION_QUEUE_NAME = 'codes-queue-email-verification';

export const CODES_JOB_NAME = 'france-connect-job';
export const API_PARTICULIER_JOB_NAME = 'api-particulier-job';
export const EMAIL_VERIFICATION_JOB_NAME = 'email-verification-job';

const JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'linear' as const, delay: 60_000 },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
};

// Memoized on globalThis so Next hot reload doesn't leak a new Queue (and its
// dedicated Redis connection) on every module re-evaluation.
type CodesQueue = Queue<EligibilityJobData>;

type ApiParticulierQueue = Queue<ApiParticulierJobData>;

// The verification job carries the api-particulier-job payload verbatim: it is exactly what
// the worker parks until the link is clicked.
type EmailVerificationQueue = Queue<ApiParticulierJobData>;

const globalForQueue = globalThis as unknown as {
  __codesQueue?: CodesQueue;
  __apiParticulierQueue?: ApiParticulierQueue;
  __emailVerificationQueue?: EmailVerificationQueue;
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

export const getApiParticulierQueue = (): ApiParticulierQueue => {
  if (!globalForQueue.__apiParticulierQueue) {
    globalForQueue.__apiParticulierQueue = new Queue<ApiParticulierJobData>(
      API_PARTICULIER_QUEUE_NAME,
      { connection: createConnection() },
    );
  }
  return globalForQueue.__apiParticulierQueue;
};

export const getEmailVerificationQueue = (): EmailVerificationQueue => {
  if (!globalForQueue.__emailVerificationQueue) {
    globalForQueue.__emailVerificationQueue = new Queue<ApiParticulierJobData>(
      EMAIL_VERIFICATION_QUEUE_NAME,
      { connection: createConnection() },
    );
  }
  return globalForQueue.__emailVerificationQueue;
};

export type ExistingJob = {
  id: string;
  state: string;
  createdAt: number | undefined;
};

// A job that exhausted its attempts is NOT an existing request: it produced nothing, nobody
// was told anything, and there is no dead-letter queue for an operator to replay it from. It
// nonetheless sits in `failed` for removeOnFail (24h), and counting it would lock the usager
// out for that whole day with "traitement en cours" — for a request that is already dead.
//
// The callers below clear it before re-enqueuing, which they must: BullMQ silently ignores an
// add() for an id already present, so leaving it would drop the resubmission.
const isDeadJob = async (job: { getState: () => Promise<string> }): Promise<boolean> =>
  (await job.getState()) === 'failed';

// Removes the corpse so `add()` for the same id is not a no-op. A job that is alive
// (waiting/active/delayed) is left untouched — that is a genuine double submit, and letting
// add() collapse onto it is the wanted behaviour.
const clearIfDead = async <T>(queue: Queue<T>, jobId: string): Promise<void> => {
  const job = await queue.getJob(jobId);
  if (job && (await isDeadJob(job))) {
    await job.remove();
  }
};

export const findJobForSub = async (sub: string): Promise<ExistingJob | null> => {
  const job = await getCodesQueue().getJob(sub);
  if (job && !(await isDeadJob(job))) {
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

  await clearIfDead(getCodesQueue(), sub);

  const job = await getCodesQueue().add(CODES_JOB_NAME, data, {
    ...JOB_OPTS,
    jobId: sub,
  });

  return { id: job.id, existing: null };
};

// Mirrors findJobForSub: the live queue first, then Postgres for the requests already
// processed — JOB_OPTS drops a job on success, so Redis alone would forget them and let a
// resubmission re-run the whole chain against API Particulier.
export const findApiParticulierJob = async (jobId: string): Promise<ExistingJob | null> => {
  const job = await getApiParticulierQueue().getJob(jobId);

  if (job && !(await isDeadJob(job))) {
    return { id: job.id ?? jobId, state: await job.getState(), createdAt: job.timestamp };
  }

  const application = await findApplicationForJobId(jobId);

  if (!application) {
    return null;
  }

  return {
    id: jobId,
    state: 'processed',
    createdAt: application.lastApplication.getTime(),
  };
};

export const enqueueApiParticulierJob = async (
  data: ApiParticulierJobData,
): Promise<{ id: string | undefined; existing: ExistingJob | null }> => {
  const queue = getApiParticulierQueue();
  const jobId = apiParticulierJobId(data);

  const existing = await findApiParticulierJob(jobId);

  if (existing) {
    return { id: existing.id, existing };
  }

  await clearIfDead(queue, jobId);

  const job = await queue.add(API_PARTICULIER_JOB_NAME, data, {
    ...JOB_OPTS,
    jobId,
  });

  return { id: job.id, existing: null };
};

// Keyed on the SAME identity hash as the job it will eventually create, which is what makes a
// double submit collapse into one email: BullMQ ignores an add() for an id already in the
// queue. Once the send completes the job is gone (removeOnComplete), so a later resubmission
// gets through and is caught by the worker's per-jobId cooldown instead.
export const enqueueEmailVerificationJob = async (
  data: ApiParticulierJobData,
): Promise<{ id: string | undefined }> => {
  const queue = getEmailVerificationQueue();
  const jobId = apiParticulierJobId(data);

  await clearIfDead(queue, jobId);

  const job = await queue.add(EMAIL_VERIFICATION_JOB_NAME, data, { ...JOB_OPTS, jobId });

  return { id: job.id };
};
