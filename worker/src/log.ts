const LOCAL_ENV = "local";

const piiEnabled = process.env.LOG_PII === "1" && process.env.ENV === LOCAL_ENV;

export const logPii = (message: string): void => {
  if (piiEnabled) {
    console.log(`[pass-sport-worker][pii] ${message}`);
  }
};
