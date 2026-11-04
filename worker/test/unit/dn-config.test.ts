import { afterEach, describe, expect, it } from "vitest";
import { DN_DEFAULT_BASE_URL, readDnConfig } from "../../src/demarche-numerique/config";

const CHAMPS = { 4242: { ine: { id: "INE" } } };
const ENV_KEYS = ["DN_DEMARCHE_NUMBER", "DN_BASE_URL", "DN_REQUEST_TIMEOUT_MS"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("readDnConfig", () => {
  it("never falls back on a démarche", () => {
    delete process.env.DN_DEMARCHE_NUMBER;

    expect(readDnConfig(CHAMPS)).toEqual({ error: "DN_DEMARCHE_NUMBER is not set" });
  });

  it("refuses a démarche without champ ids", () => {
    process.env.DN_DEMARCHE_NUMBER = "159278";

    expect(readDnConfig(CHAMPS)).toEqual({
      error: "no champ ids for démarche 159278, run pnpm dn:champs",
    });
  });

  it("refuses what is not a démarche number", () => {
    process.env.DN_DEMARCHE_NUMBER = "15927a";

    expect(readDnConfig(CHAMPS)).toHaveProperty("error");
  });

  it("reads the démarche, its champs and the defaults", () => {
    process.env.DN_DEMARCHE_NUMBER = " 4242 ";
    delete process.env.DN_BASE_URL;
    delete process.env.DN_REQUEST_TIMEOUT_MS;

    expect(readDnConfig(CHAMPS)).toEqual({
      config: {
        baseUrl: DN_DEFAULT_BASE_URL,
        demarcheNumber: 4242,
        champs: CHAMPS[4242],
        timeoutMs: 8_000,
      },
    });
  });

  it("trims a trailing slash off the base URL", () => {
    process.env.DN_DEMARCHE_NUMBER = "4242";
    process.env.DN_BASE_URL = "http://127.0.0.1:4000/";

    expect(readDnConfig(CHAMPS)).toMatchObject({ config: { baseUrl: "http://127.0.0.1:4000" } });
  });
});
