import { positiveNumberFromEnv } from "../env";
import { CHAMPS_BY_DEMARCHE, type DnChamps } from "./champs";

export const DN_DEFAULT_BASE_URL = "https://demarche.numerique.gouv.fr";

const DEFAULT_TIMEOUT_MS = 8_000;

export type DnConfig = {
  baseUrl: string;
  demarcheNumber: number;
  champs: DnChamps;
  timeoutMs: number;
};

// No default démarche: a worker that names none must never pre-fill the production one.
export const readDnConfig = (
  champsByDemarche: Record<number, DnChamps> = CHAMPS_BY_DEMARCHE,
): { config: DnConfig } | { error: string } => {
  const raw = process.env.DN_DEMARCHE_NUMBER?.trim();
  if (!raw) return { error: "DN_DEMARCHE_NUMBER is not set" };

  const demarcheNumber = Number(raw);
  if (!Number.isInteger(demarcheNumber) || demarcheNumber <= 0) {
    return { error: `DN_DEMARCHE_NUMBER="${raw}" is not a démarche number` };
  }

  const champs = champsByDemarche[demarcheNumber];
  if (!champs) return { error: `no champ ids for démarche ${demarcheNumber}, run pnpm dn:champs` };

  const baseUrl = (process.env.DN_BASE_URL?.trim() || DN_DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!URL.canParse(baseUrl)) return { error: `DN_BASE_URL="${baseUrl}" is not a URL` };

  return {
    config: {
      baseUrl,
      demarcheNumber,
      champs,
      timeoutMs: positiveNumberFromEnv("DN_REQUEST_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    },
  };
};
