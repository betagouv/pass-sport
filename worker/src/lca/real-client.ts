import type { LcaClient } from "./client";
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

  async search(payload: SearchPayload): Promise<SearchItem[] | LcaError> {
    const url = new URL(`${this.base}${SEARCH_PATH}`);
    url.search = buildSearchQuery(payload).toString();

    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) return { message: `LCA /search failed: ${res.status}`, httpStatus: res.status };

    const body = (await res.json()) as SearchItem[] | LcaError;

    if ("message" in body) return body;

    // keepMatricule server-side (never leaves the worker).
    return body.map((item) => ({ ...item, hasMatricule: !!item.matricule }));
  }

  async confirm(payload: ConfirmPayload): Promise<ConfirmItem[] | LcaError> {
    const url = new URL(`${this.base}${CONFIRM_PATH}`);
    url.search = buildConfirmQuery(payload).toString();

    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) return { message: `LCA /confirm failed: ${res.status}`, httpStatus: res.status };

    return (await res.json()) as ConfirmItem[] | LcaError;
  }
}
