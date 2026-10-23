export const FRANCE_CONNECT_QUEUE_NAME = "codes-queue-france-connect";
export const FRANCE_CONNECT_JOB_NAME = "france-connect-job";

export const FC_RELANCE_JOB_NAME = "fc-relance-job";
export const LCA_QUEUE_NAME = "codes-queue-lca";
export const LCA_JOB_NAME = "lca-job";

export const FC_CODE_EMAILS_QUEUE_NAME = "codes-queue-fc-code-emails";
export const FC_CODE_EMAILS_JOB_NAME = "fc_code_emails";
export const FC_CODE_EMAILS_JOB_ID = "fc_code_emails";

// Its own queue: a usager waits on screen, never behind the FranceConnect backlog.
export const DN_DOSSIERS_QUEUE_NAME = "codes-queue-dn-dossiers";
export const FC_DN_DOSSIER_JOB_NAME = "fc-dn-dossier-job";

// 2h, then 4h, then 18h: the three retries of a 4-attempt job span a full day, so an LCA or
// API Particulier outage lasting a working day is ridden out without the usager resubmitting.
const RETRY_DELAYS_MS = [2, 4, 18].map((hours) => hours * 3_600_000);

// attemptsMade is 1 on the first failure. Past the table the last delay repeats, which only
// happens if `attempts` is raised on the producer side without extending it here.
export const retryBackoff = (attemptsMade: number, _type?: string, _err?: Error): number =>
  RETRY_DELAYS_MS[attemptsMade - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
