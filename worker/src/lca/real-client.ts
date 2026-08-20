import type { LcaClient, LcaResponse } from "./client";
import { buildConfirmQuery, buildSearchQuery } from "./client";
import type {
  ConfirmItem,
  ConfirmPayload,
  LcaError,
  SearchItem,
  SearchPayload,
} from "./types";

// Real LCA (Gravitee) client: X-Gravitee-Api-Key auth, GET with query params.
const SEARCH_PATH = "/apim/api-asso-admin/passsport/beneficiaires/search";
const CONFIRM_PATH = "/apim/api-asso-admin/passsport/beneficiaires/confirm";

export class RealLcaClient implements LcaClient {
  private readonly base: string;
  private readonly apiKey: string;

  constructor() {
    const base = process.env.LCA_API_URL;

    if (!base) throw new Error("LCA_API_URL is missing");

    const apiKey = process.env.LCA_API_KEY;

    if (!apiKey) throw new Error("LCA_API_KEY is missing");

    this.base = base;
    this.apiKey = apiKey;
  }

  private headers(): HeadersInit {
    return { "X-Gravitee-Api-Key": this.apiKey };
  }

  async search(payload: SearchPayload): Promise<LcaResponse<SearchItem[]>> {
    const url = new URL(`${this.base}${SEARCH_PATH}`);
    url.search = buildSearchQuery(payload).toString();

    const res = await fetch(url, { headers: this.headers() });
    const httpStatus = res.status;

    if (!res.ok) {
      return { httpStatus, body: { message: `LCA /search failed: ${httpStatus}`, httpStatus } };
    }

    const body = (await res.json()) as SearchItem[] | LcaError;

    if ("message" in body) return { httpStatus, body };

    // keepMatricule server-side (never leaves the worker).
    return { httpStatus, body: body.map((item) => ({ ...item, hasMatricule: !!item.matricule })) };
  }

  async confirm(payload: ConfirmPayload): Promise<LcaResponse<ConfirmItem[]>> {
    const url = new URL(`${this.base}${CONFIRM_PATH}`);
    url.search = buildConfirmQuery(payload).toString();

    const res = await fetch(url, { headers: this.headers() });
    const httpStatus = res.status;

    if (!res.ok) {
      return { httpStatus, body: { message: `LCA /confirm failed: ${httpStatus}`, httpStatus } };
    }

    return { httpStatus, body: (await res.json()) as ConfirmItem[] | LcaError };
  }
}
