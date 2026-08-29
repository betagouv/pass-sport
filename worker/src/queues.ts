export const FRANCE_CONNECT_QUEUE_NAME = "codes-queue-france-connect";
export const FRANCE_CONNECT_JOB_NAME = "france-connect-job";

export const LCA_QUEUE_NAME = "codes-queue-lca";
export const LCA_JOB_NAME = "lca-job";

// 2h, then 4h, then 18h: the three retries of a 4-attempt job span a full day, so an LCA or
// API Particulier outage lasting a working day is ridden out without the usager resubmitting.
const RETRY_DELAYS_MS = [2, 4, 18].map((hours) => hours * 3_600_000);

// attemptsMade is 1 on the first failure. Past the table the last delay repeats, which only
// happens if `attempts` is raised on the producer side without extending it here.
export const retryBackoff = (attemptsMade: number, _type?: string, _err?: Error): number =>
  RETRY_DELAYS_MS[attemptsMade - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
