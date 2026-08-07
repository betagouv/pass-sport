export const FRANCE_CONNECT_QUEUE_NAME = "codes-queue-france-connect";
export const FRANCE_CONNECT_JOB_NAME = "france-connect-job";

export const API_PARTICULIER_QUEUE_NAME = "codes-queue-api-particulier";
export const API_PARTICULIER_JOB_NAME = "api-particulier-job";

export const EMAIL_VERIFICATION_QUEUE_NAME = "codes-queue-email-verification";
export const EMAIL_VERIFICATION_JOB_NAME = "email-verification-job";

export const linearBackoff = (attemptsMade: number, _type?: string, _err?: Error): number =>
  attemptsMade * 60_000;
