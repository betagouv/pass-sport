import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

// Worker code under test — imported from src (extensionless; Vitest/Vite resolve
// the .ts sources directly, matching the tsconfig "bundler" moduleResolution).
import {
  CODES_JOB_NAME,
  CODES_QUEUE_NAME,
  linearBackoff,
  processEligibilityJob,
  type WorkerDeps,
} from "../../src";
import { RESOURCE_META, type ApiParticulierClient } from "../../src/eligibility/client";
import type { LcaClient } from "../../src/lca/client";
import { runMigrations } from "../../src/db/migrate";
import type {
  EligibilityJobData,
  EligibilityJobPayload,
  PivotIdentity,
  ResourceResult,
} from "../../src/eligibility/types";
import type {
  ConfirmItem,
  LcaError,
  SearchItem,
  SearchPayload,
} from "../../src/lca/types";

// The real mock clients were removed with the real-only port: the worker now only
// ships real API Particulier / LCA clients. These e2e tests still exercise the REAL
// orchestration — Testcontainers Redis + Postgres, a real BullMQ Worker running the
// actual processEligibilityJob — but the upstream APIs are faked at the client
// interface (the WorkerDeps seam) so outcomes are deterministic and no network /
// credentials are needed. Email goes to a tiny in-process HTTP server that always
// answers success, so the real Link Mobility client path is still covered.

// A parent-level success row for one resource.
const okRow = (meta: { resource: string; label: string }, data: unknown): ResourceResult => ({
  ...meta,
  httpStatus: 200,
  success: true,
  data: data as ResourceResult["data"],
  rateLimitRemaining: 100,
  rateLimitResetMs: null,
});

// Deterministic API Particulier client.
// - quotient_familial: the connected user as allocataire + three children spanning the
//   QF and AEEH campaign windows (see the enfants[] comment below), and a household
//   quotient that defaults above the eligibility threshold.
// - étudiant boursier: always boursier (self CROUS-eligible when age < 28).
// - per-child AEEH: status "allocataire".
// If constructed with first429RetryAfter, the VERY FIRST call returns a 429 with
// that Retry-After (then never again) to exercise the pause-and-retry path.
class FakeApiClient implements ApiParticulierClient {
  private fired429 = false;
  // Household quotient the fake QF reports. Default sits ABOVE the 700 threshold, so
  // the QF route grants nothing unless a test lowers it (setQfValeur on the Stack).
  qfValeur = 1000;

  // Last name of the fake children. "Nomatch…" makes FakeLcaClient return no result, so
  // is_eligible reflects OUR routes alone — a confirmed LCA match sets it true whatever
  // the routes concluded (index.ts), which would otherwise mask the rule under test.
  childrenLastname = "Enfant";

  constructor(private readonly first429RetryAfter?: number) {}

  private take429(meta: { resource: string; label: string }): ResourceResult | null {
    if (!this.first429RetryAfter || this.fired429) return null;
    this.fired429 = true;
    return {
      ...meta,
      httpStatus: 429,
      success: false,
      data: null,
      rateLimited: true,
      retryAfter: this.first429RetryAfter,
      rateLimitRemaining: 0,
      rateLimitResetMs: this.first429RetryAfter * 1000,
    };
  }

  async quotientFamilial(identity: PivotIdentity): Promise<ResourceResult> {
    return (
      this.take429(RESOURCE_META.qf) ??
      okRow(RESOURCE_META.qf, {
        allocataires: [
          { nom_naissance: identity.family_name, prenoms: identity.given_name ?? "" },
        ],
        // Three children, one per zone of the two campaign windows, at the
        // 2026-12-31 reference date:
        //   Aine   born 2008 -> 18 ans: AEEH window only
        //   Milieu born 2009 -> 17 ans: BOTH windows (QF has priority)
        //   Cadet  born 2012 -> 14 ans: QF window only
        enfants: [
          {
            nom_naissance: this.childrenLastname,
            prenoms: "Aine",
            sexe: "M",
            date_naissance: "01/01/2008",
          },
          {
            nom_naissance: this.childrenLastname,
            prenoms: "Milieu",
            sexe: "F",
            date_naissance: "01/01/2009",
          },
          {
            nom_naissance: this.childrenLastname,
            prenoms: "Cadet",
            sexe: "F",
            date_naissance: "01/01/2012",
          },
        ],
        quotient_familial: { valeur: this.qfValeur },
      })
    );
  }

  async aah(): Promise<ResourceResult> {
    return this.take429(RESOURCE_META.aah) ?? okRow(RESOURCE_META.aah, { est_beneficiaire: false });
  }

  async cnous(): Promise<ResourceResult> {
    return (
      this.take429(RESOURCE_META.cnous) ??
      okRow(RESOURCE_META.cnous, { statut_boursier: { est_boursier: true } })
    );
  }

  async aeeh(_child: PivotIdentity, childIndex: number): Promise<ResourceResult> {
    return (
      this.take429(RESOURCE_META.aeeh) ?? {
        ...okRow(RESOURCE_META.aeeh, { status: "allocataire" }),
        childIndex,
      }
    );
  }
}

// Deterministic LCA client. A last name starting with "Nomatch" yields no search
// result (-> not_found); everyone else matches and confirms with a fixed code.
class FakeLcaClient implements LcaClient {
  private searchCalls = 0;

  constructor(private readonly failOnSearchCall?: number) {}

  async search(payload: SearchPayload): Promise<SearchItem[] | LcaError> {
    this.searchCalls += 1;

    if (this.failOnSearchCall && this.searchCalls === this.failOnSearchCall) {
      throw new Error("LCA /search failed: 502");
    }

    if (payload.beneficiaryLastname.toLowerCase().startsWith("nomatch")) return [];
    const isCrous = !!payload.isFromCrous;
    return [
      {
        id: 1,
        nom: payload.beneficiaryLastname,
        prenom: payload.beneficiaryFirstname,
        date_naissance: payload.beneficiaryBirthDate,
        situation: isCrous ? "boursier" : "jeune",
        organisme: isCrous ? "cnous" : "CAF",
        matricule: "SECRET-MATRICULE",
        hasMatricule: true,
      },
    ];
  }

  async confirm(): Promise<ConfirmItem[] | LcaError> {
    return [
      {
        id: 1,
        id_psp: "PSP-CODE-123",
        nom: "N",
        prenom: "P",
        date_naissance: "2004-05-15",
        situation: "boursier",
        organisme: "cnous",
        // matricule is stripped by process.ts sanitize before storage.
        allocataire: { matricule: "SECRET-MATRICULE" },
        // Present so the history test can prove it is dropped rather than pass vacuously.
        pdf_base_64: "JVBERi0xLjQK-FAKE-ATTESTATION",
      },
    ];
  }
}

export type Stack = {
  pool: pg.Pool;
  redis: Redis;
  db: WorkerDeps["db"];
  queue: Queue<EligibilityJobData>;
  enqueueAndWait: (data: EligibilityJobPayload) => Promise<unknown>;
  // Enqueue a payload and wait for the worker to reject it. Returns the failure reason.
  enqueueAndWaitFailure: (data: EligibilityJobPayload) => Promise<string>;
  // Household quotient the fake QF reports, so a test can cross the 700 threshold
  // without paying for a second container stack.
  setQfValeur: (valeur: number) => void;
  // Last name of the fake children. Set it to "Nomatch…" to make LCA find nobody, which
  // is what a test asserting on OUR eligibility routes needs — an LCA confirm sets
  // is_eligible true on its own and would hide the rule under test.
  setChildrenLastname: (lastname: string) => void;
  close: () => Promise<void>;
};

// Boots Redis + Postgres (Testcontainers) + a fake Link Mobility HTTP server, then
// wires a real BullMQ Worker running the actual processEligibilityJob with the fake
// upstream clients. Everything a pipeline test needs, torn down by close().
// `first429RetryAfter`: make the first API Particulier call return a 429 with that
// Retry-After, to exercise the worker's pause-and-retry-from-header behaviour.
export async function startStack(
  opts: { first429RetryAfter?: number; lcaFailOnSearchCall?: number } = {},
): Promise<Stack> {
  const redisC: StartedRedisContainer = await new RedisContainer("redis:8-alpine").start();
  const pgC: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();

  // Fake Link Mobility endpoint: always answers success ({resultat:1, id}). The real
  // link-mobility client (email/link-mobility.ts) POSTs here, so sendTransactionalEmail
  // returns sent:true and email_sent lands true in the persisted rows.
  const emailServer: Server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ resultat: 1, id: 123 }));
  });
  await new Promise<void>((resolve) => emailServer.listen(0, "127.0.0.1", () => resolve()));

  const emailPort = (emailServer.address() as AddressInfo).port;

  process.env.LINK_MOBILITY_API_URL = `http://127.0.0.1:${emailPort}`;
  process.env.LINK_MOBILITY_API_KEY = "test-key";
  process.env.LINK_MOBILITY_SENDER_EMAIL = "sender@example.test";
  process.env.LINK_MOBILITY_SENDER_NAME = "pass Sport";

  const pool = new pg.Pool({ connectionString: pgC.getConnectionUri() });
  await runMigrations(pool);
  const db = drizzle(pool) as WorkerDeps["db"];

  const redisUrl = redisC.getConnectionUrl();
  // Track the raw connections so we can quit them before stopping the container.
  // The no-op error handler swallows the EPIPE/ECONNRESET that would otherwise be
  // logged as "Unhandled error event" during teardown (container stops first).
  const connections: Redis[] = [];
  const conn = () => {
    const c = new Redis(redisUrl, { maxRetriesPerRequest: null });
    c.on("error", () => {});
    connections.push(c);
    return c;
  };

  const queue = new Queue<EligibilityJobData>(CODES_QUEUE_NAME, { connection: conn() });
  await queue.setGlobalConcurrency(1);

  const guardConn = conn();
  const apiClient = new FakeApiClient(opts.first429RetryAfter);
  const lcaClient = new FakeLcaClient(opts.lcaFailOnSearchCall);
  const deps: WorkerDeps = { apiClient, lcaClient, db, queue };

  const worker = new Worker<EligibilityJobData>(
    CODES_QUEUE_NAME,
    async (job) => processEligibilityJob(job, job.data, deps),
    // Same settings as production, so the producer's "linear" backoff resolves here
    // too if a test ever enqueues with attempts > 1.
    { connection: conn(), settings: { backoffStrategy: linearBackoff } },
  );
  await worker.waitUntilReady();

  const enqueueAndWait = async (data: EligibilityJobPayload): Promise<unknown> => {
    const job = await queue.add(CODES_JOB_NAME, data);
    for (let i = 0; i < 100; i++) {
      const state = await job.getState();
      if (state === "completed") return (await queue.getJob(job.id!))?.returnvalue;
      if (state === "failed") {
        const fresh = await queue.getJob(job.id!);
        throw new Error(`job ${job.id} failed: ${fresh?.failedReason ?? "<no reason>"}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${job.id} did not finish in time`);
  };

  const enqueueAndWaitFailure = async (data: EligibilityJobPayload): Promise<string> => {
    const job = await queue.add(CODES_JOB_NAME, data);
    for (let i = 0; i < 100; i++) {
      const state = await job.getState();
      if (state === "failed") return (await queue.getJob(job.id!))?.failedReason ?? "";
      if (state === "completed") throw new Error(`job ${job.id} was ACCEPTED but should have been rejected`);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${job.id} did not finish in time`);
  };

  const close = async (): Promise<void> => {
    // Close BullMQ first (stops using the connections), then quit the raw
    // connections, THEN stop the containers — so nothing reconnects to a dead port.
    await worker.close();
    await queue.close();
    await Promise.all(connections.map((c) => c.quit().catch(() => {})));
    await pool.end();
    await new Promise<void>((resolve) => emailServer.close(() => resolve()));
    await redisC.stop();
    await pgC.stop();
  };

  return {
    pool,
    db,
    queue,
    redis: guardConn,
    enqueueAndWait,
    enqueueAndWaitFailure,
    setQfValeur: (valeur: number) => {
      apiClient.qfValeur = valeur;
    },
    setChildrenLastname: (lastname: string) => {
      apiClient.childrenLastname = lastname;
    },
    close,
  };
}
