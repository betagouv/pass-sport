import { describe, expect, it } from "vitest";
import { createDnClient, DnError } from "../../src/demarche-numerique/client";

const BASE_URL = "https://dn.example.test";
const TOKEN = "tok-secret-123";

type Call = { url: string; init: RequestInit };

const fakeFetch = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, fetchImpl };
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CREATED = {
  dossier_url: `${BASE_URL}/commencer/pass-sport?prefill_token=${TOKEN}`,
  state: "prefilled",
  dossier_id: "RG9zc2llci0xMjM=",
  dossier_number: 123,
  dossier_prefill_token: TOKEN,
};

const client = (fetchImpl: typeof fetch) => createDnClient({ baseUrl: BASE_URL, timeoutMs: 1_000, fetchImpl });

const failure = async (promise: Promise<unknown>): Promise<DnError> => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof DnError) return e;
    throw e;
  }
  throw new Error("expected a DnError");
};

describe("createPrefilledDossier", () => {
  it("posts the body as plain application/json and reads the dossier back", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(201, CREATED));

    const created = await client(fetchImpl).createPrefilledDossier(159278, { identite_nom: "OSTRENYA" });

    expect(calls[0].url).toBe(`${BASE_URL}/api/public/v1/demarches/159278/dossiers`);
    expect(calls[0].init.method).toBe("POST");
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ identite_nom: "OSTRENYA" });
    expect(created).toEqual({
      dossierNumber: 123,
      dossierId: "RG9zc2llci0xMjM=",
      dossierUrl: CREATED.dossier_url,
      prefillToken: TOKEN,
    });
  });

  it("refuses, without retrying, a dossier URL on another origin", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(201, { ...CREATED, dossier_url: `https://evil.example.test/commencer?prefill_token=${TOKEN}` }),
    );

    const e = await failure(client(fetchImpl).createPrefilledDossier(1, {}));

    expect(e.retryable).toBe(false);
  });

  it("refuses, without retrying, an incomplete answer", async () => {
    const { fetchImpl } = fakeFetch(() => json(201, { ...CREATED, dossier_number: undefined }));

    expect((await failure(client(fetchImpl).createPrefilledDossier(1, {}))).retryable).toBe(false);
  });

  it("keeps DN's message out of the error message", async () => {
    const { fetchImpl } = fakeFetch(() => json(400, { error: "Champ invalide : 12/13/2015" }));

    const e = await failure(client(fetchImpl).createPrefilledDossier(1, {}));

    expect(e).toMatchObject({ httpStatus: 400, retryable: false, detail: "Champ invalide : 12/13/2015" });
    expect(e.message).not.toContain("12/13/2015");
  });

  it.each([429, 500, 503])("retries on %i", async (status) => {
    const { fetchImpl } = fakeFetch(() => json(status, {}));

    expect((await failure(client(fetchImpl).createPrefilledDossier(1, {}))).retryable).toBe(true);
  });

  it("retries when no answer came back", async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });

    const e = await failure(client(fetchImpl).createPrefilledDossier(1, {}));

    expect(e).toMatchObject({ httpStatus: null, retryable: true });
  });
});

describe("findByPrefillToken", () => {
  it("reads an unclaimed dossier", async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, [CREATED]));

    const status = await client(fetchImpl).findByPrefillToken(159278, TOKEN);

    expect(calls[0].url).toBe(
      `${BASE_URL}/api/public/v1/demarches/159278/dossiers?prefill_token=${TOKEN}`,
    );
    expect(status).toEqual({ dossierNumber: 123, state: "prefilled", submittedAt: null, processedAt: null });
  });

  it("reads a submitted dossier", async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(200, [
        {
          state: "en_construction",
          submitted_at: "2026-10-20T10:00:00+02:00",
          dossier_id: CREATED.dossier_id,
          dossier_number: 123,
          dossier_prefill_token: TOKEN,
        },
      ]),
    );

    expect(await client(fetchImpl).findByPrefillToken(1, TOKEN)).toEqual({
      dossierNumber: 123,
      state: "en_construction",
      submittedAt: "2026-10-20T10:00:00+02:00",
      processedAt: null,
    });
  });

  it("answers null for a dossier DN no longer lists", async () => {
    const { fetchImpl } = fakeFetch(() => json(200, []));

    expect(await client(fetchImpl).findByPrefillToken(1, TOKEN)).toBeNull();
  });

  it("never puts the token in the error message", async () => {
    const { fetchImpl } = fakeFetch(() => json(502, {}));

    const e = await failure(client(fetchImpl).findByPrefillToken(1, TOKEN));

    expect(e.retryable).toBe(true);
    expect(e.message).not.toContain(TOKEN);
  });
});
