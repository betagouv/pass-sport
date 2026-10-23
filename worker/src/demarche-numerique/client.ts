import type { PrefillBody } from "./prefill";

// The public prefill API (/api/public/v1): no authentication, the dossier is created orphan and
// goes to whoever opens its URL and logs in first.

export type DnCreatedDossier = {
  dossierNumber: number;
  dossierId: string;
  // Carries the prefill token: a bearer secret, like the token itself.
  dossierUrl: string;
  prefillToken: string;
};

export type DnDossierStatus = {
  dossierNumber: number;
  // 'prefilled' while unclaimed, DN's dossier state afterwards.
  state: string;
  submittedAt: string | null;
  processedAt: string | null;
};

export type DnOperation = "create" | "lookup";

export class DnError extends Error {
  constructor(
    readonly operation: DnOperation,
    readonly httpStatus: number | null,
    readonly retryable: boolean,
    // DN's own message, for the history only: the error message reaches Sentry.
    readonly detail?: string,
  ) {
    super(`Démarche Numérique ${operation} failed (${httpStatus ?? "no response"})`);
    this.name = "DnError";
  }
}

export interface DemarcheNumeriqueClient {
  createPrefilledDossier(demarche: number, body: PrefillBody): Promise<DnCreatedDossier>;
  // Null when DN no longer lists the dossier: deleted, or hidden by its owner.
  findByPrefillToken(demarche: number, token: string): Promise<DnDossierStatus | null>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const errorDetail = (text: string): string | undefined => {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) && typeof parsed.error === "string"
      ? parsed.error.slice(0, 500)
      : undefined;
  } catch {
    return undefined;
  }
};

export const createDnClient = ({
  baseUrl,
  timeoutMs,
  fetchImpl = fetch,
}: {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}): DemarcheNumeriqueClient => {
  const origin = new URL(baseUrl).origin;
  const dossiersUrl = (demarche: number) =>
    `${baseUrl}/api/public/v1/demarches/${demarche}/dossiers`;

  const send = async (operation: DnOperation, url: string, init: RequestInit): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // A timeout or a severed socket says nothing of what DN did: retried.
      throw new DnError(operation, null, true);
    }

    const text = await res.text().catch(() => "");

    if (!res.ok) {
      throw new DnError(
        operation,
        res.status,
        res.status === 429 || res.status >= 500,
        errorDetail(text),
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new DnError(operation, res.status, false, "réponse illisible");
    }
  };

  return {
    async createPrefilledDossier(demarche, body) {
      const payload = await send("create", dossiersUrl(demarche), {
        method: "POST",
        // Exactly this: DN answers 400 to a Content-Type carrying a charset.
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      // Not retried: DN may well have created it, and a retry would create another.
      const incomplete = () => new DnError("create", 201, false, "réponse incomplète");

      if (!isRecord(payload)) throw incomplete();

      const { dossier_url, dossier_id, dossier_number, dossier_prefill_token } = payload;
      if (
        typeof dossier_url !== "string" ||
        !URL.canParse(dossier_url) ||
        new URL(dossier_url).origin !== origin ||
        typeof dossier_id !== "string" ||
        !Number.isInteger(dossier_number) ||
        typeof dossier_prefill_token !== "string" ||
        !dossier_prefill_token
      ) {
        throw incomplete();
      }

      return {
        dossierNumber: dossier_number as number,
        dossierId: dossier_id,
        dossierUrl: dossier_url,
        prefillToken: dossier_prefill_token,
      };
    },

    async findByPrefillToken(demarche, token) {
      const payload = await send(
        "lookup",
        `${dossiersUrl(demarche)}?prefill_token=${encodeURIComponent(token)}`,
        { method: "GET", headers: { Accept: "application/json" } },
      );

      if (!Array.isArray(payload)) throw new DnError("lookup", 200, false, "réponse illisible");

      // DN filters on the token itself: whatever it lists is this dossier.
      const [entry] = payload as unknown[];
      if (entry === undefined) return null;

      if (
        !isRecord(entry) ||
        !Number.isInteger(entry.dossier_number) ||
        typeof entry.state !== "string"
      ) {
        throw new DnError("lookup", 200, false, "réponse incomplète");
      }

      const date = (value: unknown) => (typeof value === "string" ? value : null);

      return {
        dossierNumber: entry.dossier_number as number,
        state: entry.state,
        submittedAt: date(entry.submitted_at),
        processedAt: date(entry.processed_at),
      };
    },
  };
};
