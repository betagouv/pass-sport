import { existsSync } from "node:fs";

const ENV_FILE = ".env.local";
if (existsSync(ENV_FILE) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(ENV_FILE);
  console.info(`[pass-sport-worker] loaded ${ENV_FILE}`);
}
