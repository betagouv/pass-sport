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
  FC_CODE_EMAILS_JOB_ID,
  FC_CODE_EMAILS_JOB_NAME,
  FC_CODE_EMAILS_QUEUE_NAME,
  FRANCE_CONNECT_JOB_NAME,
  FRANCE_CONNECT_QUEUE_NAME,
  LCA_JOB_NAME,
  LCA_QUEUE_NAME,
  retryBackoff,
} from "../../src/queues";
import { processEligibilityJob, type FranceConnectDeps } from "../../src/jobs/france-connect";
import { processLcaJob, type LcaDeps } from "../../src/jobs/lca";
import { processFcCodeEmailsJob, type FcCodeEmailsJobData } from "../../src/jobs/fc-code-emails";
import { RESOURCE_META, type ApiParticulierClient } from "../../src/eligibility/client";
import { runMigrations } from "../../src/db/migrate";
import { eligibilityResults, type Verdict } from "../../src/db/schema";
import type { OutcomeEmailKind } from "../../src/email/notify";
import type {
  EligibilityJobData,
  EligibilityJobPayload,
  LcaJobData,
  PivotIdentity,
  ResourceResult,
  ResultSituation,
} from "../../src/eligibility/types";

// The real mock clients were removed with the real-only port: the worker now only
// ships a real API Particulier client — LCA is not called from the worker at all. These
// e2e tests still exercise the REAL orchestration — Testcontainers Redis + Postgres, a real
// BullMQ Worker running the actual processEligibilityJob — but API Particulier is faked at the
// client interface (the FranceConnectDeps seam) so outcomes are deterministic and no network /
// credentials are needed. Email goes to a tiny in-process HTTP server that always
// answers success, so the real Link Mobility client path is still covered.

// Frozen clock for the whole stack. The quotient_familial sweep runs from août to the current
// month, so call counts would otherwise drift with the calendar: pinned mid-septembre, every
// job sweeps exactly août then septembre.
export const STACK_NOW = new Date("2026-09-15T12:00:00Z");
export const SWEPT_MONTHS = 2;

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
// - quotient_familial: the connected user as allocataire + four children spanning the
//   QF and AEEH campaign windows (see the enfants[] comment below), and a household
//   quotient that defaults above the eligibility threshold.
// - étudiant boursier: boursier by default (self CROUS-eligible inside the window).
// - per-child AEEH: status "allocataire".
// If constructed with first429RetryAfter, the VERY FIRST call returns a 429 with
// that Retry-After (then never again) to exercise the pause-and-retry path.
class FakeApiClient implements ApiParticulierClient {
  private fired429 = false;
  // Counts every resource call, so a test can make the Nth one answer 502.
  private calls = 0;
  // Household quotient the fake QF reports. Default sits ABOVE the 700 threshold, so
  // the QF route grants nothing unless a test lowers it (setQfValeur on the Stack).
  qfValeur = 1000;

  // Per-month override, for a household that only crosses the threshold partway through the
  // campaign. Months absent from it fall back to qfValeur.
  qfValeurByMois: Record<string, number> = {};

  // Last name of the fake children. Purely cosmetic now that no LCA base is consulted:
  // is_eligible reflects OUR routes alone.
  childrenLastname = "Enfant";

  // QF answers with no enfant at all: a demande for a child aide that leaves no
  // beneficiary to search, only the demande itself to record.
  qfChildless = false;

  // Caisse that served the quotient, as API Particulier spells it.
  qfFournisseur: string | undefined = "CNAF";

  constructor(
    private readonly first429RetryAfter?: number,
    private readonly failOnCall?: number,
    // Which call answers the 429. The first one leaves the checkpoint empty — nothing is
    // committed before handleRateLimit throws — so only a later one exercises a resume that has
    // rows to replay.
    private readonly rateLimitOnCall: number = 1,
  ) {}

  // The gateway answering 5xx on one call of the chain: the job has no verdict for that
  // resource, so it fails and retries rather than concluding on a partial answer.
  private takeFailure(meta: { resource: string; label: string }): ResourceResult | null {
    this.calls += 1;
    if (this.calls !== this.failOnCall) return null;
    return {
      ...meta,
      httpStatus: 502,
      success: false,
      data: null,
      error: "API Particulier gateway answered 502",
      rateLimitRemaining: 100,
      rateLimitResetMs: null,
    };
  }

  private take429(meta: { resource: string; label: string }): ResourceResult | null {
    if (!this.first429RetryAfter || this.fired429 || this.calls !== this.rateLimitOnCall) {
      return null;
    }
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

  async quotientFamilial(identity: PivotIdentity, mois?: string): Promise<ResourceResult> {
    return (
      this.takeFailure(RESOURCE_META.qf) ??
      this.take429(RESOURCE_META.qf) ??
      okRow(RESOURCE_META.qf, {
        allocataires: [
          { nom_naissance: identity.family_name, prenoms: identity.given_name ?? "" },
        ],
        // Four children, one per zone of the two campaign windows, at the
        // 2026-12-31 reference date:
        //   Adulte born 2005 -> 21 ans: NEITHER window, never queried
        //   Aine   born 2008 -> 18 ans: AEEH window only
        //   Milieu born 2009 -> 17 ans: BOTH windows (QF has priority)
        //   Cadet  born 2012 -> 14 ans: BOTH windows (QF has priority)
        enfants: this.qfChildless ? [] : [
          {
            nom_naissance: this.childrenLastname,
            prenoms: "Adulte",
            sexe: "M",
            date_naissance: "01/01/2005",
          },
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
            nom_usage: "Bravenne",
            prenoms: "Cadet",
            sexe: "F",
            date_naissance: "01/01/2012",
          },
        ],
        quotient_familial: {
          valeur: this.qfValeurByMois[mois ?? ""] ?? this.qfValeur,
          fournisseur: this.qfFournisseur,
        },
      })
    );
  }

  aahBeneficiaire = false;
  crousBoursier = true;

  async aah(): Promise<ResourceResult> {
    return (
      this.takeFailure(RESOURCE_META.aah) ??
      this.take429(RESOURCE_META.aah) ??
      okRow(RESOURCE_META.aah, { est_beneficiaire: this.aahBeneficiaire })
    );
  }

  async cnous(): Promise<ResourceResult> {
    return (
      this.takeFailure(RESOURCE_META.cnous) ??
      this.take429(RESOURCE_META.cnous) ??
      okRow(RESOURCE_META.cnous, { statut_boursier: { est_boursier: this.crousBoursier } })
    );
  }

  async cnousByIne(): Promise<ResourceResult> {
    return (
      this.takeFailure(RESOURCE_META.cnousIne) ??
      this.take429(RESOURCE_META.cnousIne) ??
      okRow(RESOURCE_META.cnousIne, { statut_boursier: { est_boursier: true } })
    );
  }

  // Set false to make AEEH the losing route, which is what leaves the household quotient as the
  // only thing that can carry a child.
  aeehBeneficiaire = true;

  async aeeh(_child: PivotIdentity, childIndex: number): Promise<ResourceResult> {
    return (
      this.takeFailure(RESOURCE_META.aeeh) ?? this.take429(RESOURCE_META.aeeh) ?? {
        ...okRow(RESOURCE_META.aeeh, {
          status: this.aeehBeneficiaire ? "allocataire" : "non_allocataire",
        }),
        childIndex,
      }
    );
  }
}

// Distinct on purpose: `message=<id>` is the only evidence of which mail went out.
export const TEMPLATE_IDS = {
  not_eligible_hors_fc: 1004,
  acknowledgment: 1005,
  code_direct_aah: 1006,
  code_direct_boursier: 1007,
  code_indirect: 1008,
} as const;

export type SentEmail = {
  subject: string;
  campaign: string | null;
  templateId: string;
  recipients: string[];
  variables: Record<string, Record<string, string>>;
  // `date`, in seconds. Null on an immediate send, which omits the parameter.
  sendAt: number | null;
};

// URLSearchParams, never decodeURIComponent: form encoding writes a space as '+', which
// decodeURIComponent leaves as a literal '+'.
export const parseSentEmail = (raw: string): SentEmail => {
  const params = new URLSearchParams(raw);
  const variables: SentEmail["variables"] = {};

  for (const [key, value] of params.entries()) {
    const match = key.match(/^destinataires\[([^\]]+)\]\[([^\]]+)\]$/);
    if (match) (variables[match[1]] ??= {})[match[2]] = value;
  }

  // Two recipient forms: PHP-array style with merge variables, plain list without.
  const plain = params.get("destinataires");

  const sendAt = params.get("date");

  return {
    subject: params.get("sujet") ?? "",
    campaign: params.get("nom"),
    templateId: params.get("message") ?? "",
    recipients: plain ? plain.split(",") : Object.keys(variables),
    variables,
    sendAt: sendAt === null ? null : Number(sendAt),
  };
};

export type ConfirmedSeed = {
  sub: string;
  code: string;
  source?: "self" | "enfant";
  lastname?: string;
  firstname?: string;
  birthdate?: string;
  // What the code-mail sweep reads. A non-null emailKind is what a parcours hors FranceConnect
  // row looks like, and the sweep must ignore it.
  verdict?: Verdict;
  situation?: ResultSituation;
  emailKind?: OutcomeEmailKind;
  emailAttempts?: number;
  email?: string;
};

export type Stack = {
  pool: pg.Pool;
  redis: Redis;
  db: FranceConnectDeps["db"];
  queue: Queue<EligibilityJobData>;
  enqueueAndWait: (data: EligibilityJobPayload) => Promise<unknown>;
  // Enqueue a payload and wait for the worker to reject it. Returns the failure reason.
  enqueueAndWaitFailure: (data: EligibilityJobPayload) => Promise<string>;

  // The two-step form flow, on its own queue and worker exactly as in production. The LCA
  // calls happen on the site, so what lands here is already an outcome.
  lcaQueue: Queue<LcaJobData>;
  enqueueLcaAndWait: (data: LcaJobData, jobId?: string) => Promise<unknown>;
  enqueueLcaAndWaitFailure: (data: LcaJobData) => Promise<string>;

  // The fc_code_emails pass, on its own queue and worker as in production.
  fcCodeEmailsQueue: Queue<FcCodeEmailsJobData>;
  // Inserts a row exactly as the data/ write-backs leave it: confirmed, holding a code, never
  // mailed. Returns its id.
  seedConfirmedRow: (seed: ConfirmedSeed) => Promise<string>;
  enqueueFcCodeEmailsAndWait: (
    data?: Partial<FcCodeEmailsJobData>,
    jobId?: string,
  ) => Promise<unknown>;

  // Raw form bodies received by the fake Link Mobility server, newest last.
  sentEmails: () => string[];
  parsedEmails: () => SentEmail[];
  // Answer every subsequent send with this HTTP status instead of {resultat:1}; null
  // restores the success answer.
  setEmailHttpStatus: (status: number | null) => void;
  // Answer every subsequent send with {resultat:0, erreurs:<codes>}, a comma-separated list as
  // Link Mobility sends it; null restores the success answer.
  setEmailErreurs: (codes: string | null) => void;

  setAahBeneficiaire: (value: boolean) => void;
  setCrousBoursier: (value: boolean) => void;
  setAeehBeneficiaire: (value: boolean) => void;
  // Household quotient the fake QF reports, so a test can cross the 700 threshold
  // without paying for a second container stack.
  setQfValeur: (valeur: number) => void;
  // Quotient per campaign month, for a household that only crosses the threshold partway
  // through the sweep.
  setQfValeurByMois: (byMois: Record<string, number>) => void;
  // Moves the clock the quotient sweep reads, so a test can cover more campaign months than the
  // two STACK_NOW gives.
  setNow: (now: Date) => void;
  // Last name of the fake children, so a test can tell one run's beneficiaries from another's.
  setChildrenLastname: (lastname: string) => void;
  // Strips the fake children from the QF answer, leaving a child-aide demande with no
  // beneficiary at all.
  setQfChildless: (childless: boolean) => void;
  // Caisse the fake QF answers with, undefined for a payload that names none.
  setQfFournisseur: (fournisseur: string | undefined) => void;
  close: () => Promise<void>;
};

// Boots Redis + Postgres (Testcontainers) + a fake Link Mobility HTTP server, then
// wires a real BullMQ Worker running the actual processEligibilityJob with the fake
// upstream clients. Everything a pipeline test needs, torn down by close().
// `first429RetryAfter`: make one API Particulier call return a 429 with that Retry-After, to
// exercise the worker's pause-and-retry-from-header behaviour. `apiRateLimitOnCall` chooses
// which call that is (1-based, defaults to the first).
export async function startStack(
  opts: {
    first429RetryAfter?: number;
    apiFailOnCall?: number;
    apiRateLimitOnCall?: number;
  } = {},
): Promise<Stack> {
  const redisC: StartedRedisContainer = await new RedisContainer("redis:8-alpine").start();
  const pgC: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine").start();

  // Fake Link Mobility endpoint: always answers success ({resultat:1, id}). The real
  // link-mobility client (email/link-mobility.ts) POSTs here, so sendTransactionalEmail
  // returns sent:true and email_sent lands true in the persisted rows.
  // Bodies are kept so a test can assert on what was actually mailed — the verification
  // link only exists here, never in the database.
  const sentEmails: string[] = [];
  // Set to make the next answers non-2xx, so a test can exercise what the worker records
  // when Link Mobility itself is down rather than when it rejects a payload.
  let emailHttpStatus: number | null = null;
  // The other failure: a 200 carrying {resultat:0, erreurs}. Told apart from the one above
  // because only this one says whether a resend could ever succeed.
  let emailErreurs: string | null = null;
  const emailServer: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      sentEmails.push(Buffer.concat(chunks).toString("utf8"));
      if (emailHttpStatus !== null) {
        res.statusCode = emailHttpStatus;
        res.end();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          emailErreurs !== null ? { resultat: 0, erreurs: emailErreurs } : { resultat: 1, id: 123 },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => emailServer.listen(0, "127.0.0.1", () => resolve()));

  const emailPort = (emailServer.address() as AddressInfo).port;

  process.env.LINK_MOBILITY_API_URL = `http://127.0.0.1:${emailPort}`;
  process.env.LINK_MOBILITY_API_KEY = "test-key";
  process.env.LINK_MOBILITY_SENDER_EMAIL = "sender@example.test";
  process.env.LINK_MOBILITY_SENDER_NAME = "pass Sport";
  process.env.LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH = String(TEMPLATE_IDS.code_direct_aah);
  process.env.LINK_MOBILITY_TEMPLATE_CODE_DIRECT_BOURSIER = String(
    TEMPLATE_IDS.code_direct_boursier,
  );
  process.env.LINK_MOBILITY_TEMPLATE_CODE_INDIRECT = String(TEMPLATE_IDS.code_indirect);
  process.env.LINK_MOBILITY_TEMPLATE_NOT_ELIGIBLE_HORS_FC = String(
    TEMPLATE_IDS.not_eligible_hors_fc,
  );
  process.env.LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT = String(TEMPLATE_IDS.acknowledgment);

  const pool = new pg.Pool({ connectionString: pgC.getConnectionUri() });
  await runMigrations(pool);
  const db = drizzle(pool) as FranceConnectDeps["db"];

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

  const queue = new Queue<EligibilityJobData>(FRANCE_CONNECT_QUEUE_NAME, { connection: conn() });
  await queue.setGlobalConcurrency(1);

  const guardConn = conn();
  const apiClient = new FakeApiClient(
    opts.first429RetryAfter,
    opts.apiFailOnCall,
    opts.apiRateLimitOnCall,
  );

  // Read per job rather than captured, so setNow can move the campaign month a test sweeps over.
  let stackNow = STACK_NOW;
  const deps: FranceConnectDeps = { apiClient, db, queue, now: () => stackNow };

  const worker = new Worker<EligibilityJobData>(
    FRANCE_CONNECT_QUEUE_NAME,
    async (job) => processEligibilityJob(job, job.data, deps),
    // Same settings as production, so the producer's "escalating" backoff resolves here
    // too if a test ever enqueues with attempts > 1.
    { connection: conn(), settings: { backoffStrategy: retryBackoff } },
  );
  await worker.waitUntilReady();

  const enqueueAndWait = async (data: EligibilityJobPayload): Promise<unknown> => {
    const job = await queue.add(FRANCE_CONNECT_JOB_NAME, data);
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
    const job = await queue.add(FRANCE_CONNECT_JOB_NAME, data);
    for (let i = 0; i < 100; i++) {
      const state = await job.getState();
      if (state === "failed") return (await queue.getJob(job.id!))?.failedReason ?? "";
      if (state === "completed") throw new Error(`job ${job.id} was ACCEPTED but should have been rejected`);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${job.id} did not finish in time`);
  };

  const lcaQueue = new Queue<LcaJobData>(LCA_QUEUE_NAME, { connection: conn() });
  await lcaQueue.setGlobalConcurrency(1);

  const lcaDeps: LcaDeps = { db };

  const lcaWorker = new Worker<LcaJobData>(
    LCA_QUEUE_NAME,
    async (job) => processLcaJob(job, job.data, lcaDeps),
    { connection: conn(), settings: { backoffStrategy: retryBackoff } },
  );
  await lcaWorker.waitUntilReady();

  const waitFor = async (
    q: Queue<LcaJobData>,
    jobId: string,
    want: "completed" | "failed",
  ): Promise<unknown> => {
    for (let i = 0; i < 100; i++) {
      const fresh = await q.getJob(jobId);
      const state = await fresh?.getState();
      if (state === want) return want === "failed" ? (fresh?.failedReason ?? "") : fresh?.returnvalue;
      if (state === "completed" || state === "failed") {
        throw new Error(`job ${jobId} ended as ${state}, expected ${want}: ${fresh?.failedReason ?? ""}`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`job ${jobId} did not finish in time`);
  };

  const enqueueLcaAndWait = async (data: LcaJobData, jobId?: string): Promise<unknown> => {
    const job = await lcaQueue.add(LCA_JOB_NAME, data, jobId ? { jobId } : undefined);
    return waitFor(lcaQueue, job.id!, "completed");
  };

  const enqueueLcaAndWaitFailure = async (data: LcaJobData): Promise<string> => {
    const job = await lcaQueue.add(LCA_JOB_NAME, data);
    return (await waitFor(lcaQueue, job.id!, "failed")) as string;
  };

  const fcCodeEmailsQueue = new Queue<FcCodeEmailsJobData>(FC_CODE_EMAILS_QUEUE_NAME, {
    connection: conn(),
  });
  await fcCodeEmailsQueue.setGlobalConcurrency(1);

  const fcCodeEmailsWorker = new Worker<FcCodeEmailsJobData>(
    FC_CODE_EMAILS_QUEUE_NAME,
    async (job) => processFcCodeEmailsJob(job, job.data, { db }),
    { connection: conn(), settings: { backoffStrategy: retryBackoff } },
  );
  await fcCodeEmailsWorker.waitUntilReady();

  const seedConfirmedRow = async (seed: ConfirmedSeed): Promise<string> => {
    const source = seed.source ?? "self";
    const identity = {
      family_name: seed.lastname ?? "OSTRENYA",
      given_name: seed.firstname ?? "Velmorak",
      birthdate: seed.birthdate ?? "1990-03-14",
      birthplace: "75056",
      birthcountry: "99100",
    };

    const [inserted] = await db
      .insert(eligibilityResults)
      .values({
        jobId: seed.sub,
        source,
        allocataireIdentite: identity,
        enfantIdentite: source === "enfant" ? identity : null,
        allocataireFcSub: seed.sub,
        isEligible: true,
        isFranceConnected: true,
        residenceInsee: null,
        lcaStatus: "not_applicable",
        verdict: seed.verdict ?? "eligible_confirmed",
        passSportCode: seed.code,
        situation: seed.situation ?? null,
        emailKind: seed.emailKind ?? null,
        emailAttempts: seed.emailAttempts ?? 0,
        emailSent: false,
        email: seed.email === undefined ? `${seed.sub}@example.test` : seed.email,
      })
      .returning({ id: eligibilityResults.id });

    return inserted.id;
  };

  const enqueueFcCodeEmailsAndWait = async (
    data: Partial<FcCodeEmailsJobData> = {},
    jobId: string = FC_CODE_EMAILS_JOB_ID,
  ): Promise<unknown> => {
    const job = await fcCodeEmailsQueue.add(
      FC_CODE_EMAILS_JOB_NAME,
      { enqueuedAt: new Date().toISOString(), reason: "manual", ...data },
      // removeOnComplete as in production: the id is constant, so a retained job blocks every
      // later pass.
      { jobId, attempts: 1, removeOnComplete: true },
    );
    const id = job.id!;

    for (let i = 0; i < 200; i++) {
      const fresh = await fcCodeEmailsQueue.getJob(id);
      // A finished job is gone rather than 'completed', so its absence is the success signal.
      if (!fresh) return undefined;
      const state = await fresh.getState();
      if (state === "failed") {
        throw new Error(`job ${id} failed: ${fresh.failedReason ?? "<no reason>"}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    throw new Error(`job ${id} did not finish in time`);
  };

  const close = async (): Promise<void> => {
    // Close BullMQ first (stops using the connections), then quit the raw
    // connections, THEN stop the containers — so nothing reconnects to a dead port.
    await worker.close();
    await queue.close();
    await lcaWorker.close();
    await lcaQueue.close();
    await fcCodeEmailsWorker.close();
    await fcCodeEmailsQueue.close();
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
    lcaQueue,
    enqueueLcaAndWait,
    enqueueLcaAndWaitFailure,
    fcCodeEmailsQueue,
    seedConfirmedRow,
    enqueueFcCodeEmailsAndWait,
    sentEmails: () => sentEmails,
    parsedEmails: () => sentEmails.map(parseSentEmail),
    setEmailHttpStatus: (status) => {
      emailHttpStatus = status;
    },
    setEmailErreurs: (codes) => {
      emailErreurs = codes;
    },
    setCrousBoursier: (value: boolean) => {
      apiClient.crousBoursier = value;
    },
    setAeehBeneficiaire: (value: boolean) => {
      apiClient.aeehBeneficiaire = value;
    },
    setQfValeurByMois: (byMois: Record<string, number>) => {
      apiClient.qfValeurByMois = byMois;
    },
    setNow: (now: Date) => {
      stackNow = now;
    },
    setAahBeneficiaire: (value: boolean) => {
      apiClient.aahBeneficiaire = value;
    },
    setQfValeur: (valeur: number) => {
      apiClient.qfValeur = valeur;
    },
    setChildrenLastname: (lastname: string) => {
      apiClient.childrenLastname = lastname;
    },
    setQfChildless: (childless: boolean) => {
      apiClient.qfChildless = childless;
    },
    setQfFournisseur: (fournisseur: string | undefined) => {
      apiClient.qfFournisseur = fournisseur;
    },
    close,
  };
}
