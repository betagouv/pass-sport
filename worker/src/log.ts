// Logs carrying personal data (names, birthdates, email addresses). Off unless LOG_PII=1
const piiEnabled = process.env.LOG_PII === "1" && !process.env.ENV;

export const logPii = (message: string): void => {
  if (piiEnabled) {
    console.log(`[pass-sport-worker][pii] ${message}`);
  }
};
