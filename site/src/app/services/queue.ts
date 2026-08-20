import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { findApplicationForSub } from '@/app/services/applications';
import { type EligibilityJobData, type LcaJobData, lcaJobId } from '@/app/services/eligibility-job';

export type {
  Allowance,
  EligibilityJobData,
  LcaHistoryEvent,
  LcaJobData,
  PivotIdentity,
  Situation,
} from '@/app/services/eligibility-job';
export { ALLOWANCE, SITUATION, lcaJobId } from '@/app/services/eligibility-job';

export const CODES_QUEUE_NAME = 'codes-queue-france-connect';
export const LCA_QUEUE_NAME = 'codes-queue-lca';

export const CODES_JOB_NAME = 'france-connect-job';
export const LCA_JOB_NAME = 'lca-job';

const JOB_OPTS = {
  attempts: 4,
  // Not a BullMQ builtin, which is what routes it to the worker's `retryBackoff` strategy.
  // The delays live there; nothing on this side would be read.
  backoff: { type: 'escalating' as const },
  removeOnComplete: true,
  removeOnFail: { age: 86_400 },
};

// Memoized on globalThis so Next hot reload doesn't leak a new Queue (and its
// dedicated Redis connection) on every module re-evaluation.
type CodesQueue = Queue<EligibilityJobData>;

type LcaQueue = Queue<LcaJobData>;

const globalForQueue = globalThis as unknown as {
  __codesQueue?: CodesQueue;
  __lcaQueue?: LcaQueue;
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

export const getLcaQueue = (): LcaQueue => {
  if (!globalForQueue.__lcaQueue) {
    globalForQueue.__lcaQueue = new Queue<LcaJobData>(LCA_QUEUE_NAME, {
      connection: createConnection(),
    });
  }
  return globalForQueue.__lcaQueue;
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

// Keyed on the beneficiary identity hash, so a double submit collapses into one email:
// BullMQ ignores an add() for an id already in the queue. Once the send completes the job is
// gone (removeOnComplete) and a later resubmission gets through — the worker recognises the
// row it already wrote and stays quiet.
//
// Nothing is awaited on the verdict: the usager already has their code on screen, and a
// Redis hiccup must not turn a successful test into an error page.
export const enqueueLcaJob = async (data: LcaJobData): Promise<{ id: string | undefined }> => {
  const queue = getLcaQueue();
  const jobId = lcaJobId(data);

  await clearIfDead(queue, jobId);

  const job = await queue.add(LCA_JOB_NAME, data, { ...JOB_OPTS, jobId });

  return { id: job.id };
};
