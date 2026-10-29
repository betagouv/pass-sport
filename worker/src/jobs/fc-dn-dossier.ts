import { UnrecoverableError, type Job } from "bullmq";
import { and, desc, eq, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { startTimer, type HistoryRecorder } from "../db/history";
import { fcDnDossiers } from "../db/schema";
import {
  DnError,
  type DemarcheNumeriqueClient,
  type DnCreatedDossier,
  type DnDossierStatus,
} from "../demarche-numerique/client";
import type { DnConfig } from "../demarche-numerique/config";
import { loadApiRows, toResourceResults } from "../demarche-numerique/facts";
import { buildPrefill, type DnIdentity, type PrefillBody } from "../demarche-numerique/prefill";
import { findLastRunRows } from "./fc-relance";
import { startJob } from "./shared";

export const DN_PREFILL_ACTION = "dn.dossier_prefill";
export const DN_STATE_ACTION = "dn.dossier_etat";

const PREFILLED = "prefilled";
const GONE = "gone";

export type FcDnDossierJobData = {
  identity: DnIdentity;
  clientIp?: string | null;
  userAgent?: string | null;
  // Written as soon as DN created the dossier, so a retry stores that one rather than creating
  // another. Holds the bearer URL: the producer keeps failed jobs a day only.
  created?: DnCreatedDossier;
};

export type FcDnDossierDeps = {
  db: Database;
  // Both null when the worker has no usable Démarche Numérique configuration.
  dn: DemarcheNumeriqueClient | null;
  config: DnConfig | null;
};

export type FcDnDossierOutcome = {
  outcome: "created" | "recreated" | "refreshed" | "skipped";
  dossierNumber?: number;
  state?: string;
  raison?: string;
};

type LiveDossier = typeof fcDnDossiers.$inferSelect;

const toDate = (iso: string | null): Date | null =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : null;

// A refusal a retry would only hear again ends the job: the usager asks again from the site.
const toJobError = (e: unknown): unknown =>
  e instanceof DnError && !e.retryable ? new UnrecoverableError(e.message) : e;

const recordFailure = (
  history: HistoryRecorder,
  action: string,
  e: unknown,
  durationMs: number,
  extra: { bodyPayload?: PrefillBody; dossierNumber?: number } = {},
) =>
  history.record({
    actor: "demarche_numerique",
    action,
    status: e instanceof DnError && e.httpStatus === 400 ? "invalid_request" : "error",
    httpStatus: e instanceof DnError ? e.httpStatus : null,
    durationMs,
    error: e instanceof DnError ? (e.detail ?? e.message) : (e as Error).message,
    bodyPayload: extra.bodyPayload ?? null,
    responsePayload:
      extra.dossierNumber === undefined ? null : { dossier_number: extra.dossierNumber },
  });

const skip = (history: HistoryRecorder, raison: string) =>
  history.record({
    actor: "worker",
    action: DN_PREFILL_ACTION,
    status: "skipped",
    responsePayload: { raison },
  });

const findLiveDossier = async (
  database: Database,
  sub: string,
  demarcheNumber: number,
): Promise<LiveDossier | undefined> => {
  const [row] = await database
    .select()
    .from(fcDnDossiers)
    .where(
      and(
        eq(fcDnDossiers.allocataireFcSub, sub),
        eq(fcDnDossiers.demarcheNumber, demarcheNumber),
        ne(fcDnDossiers.state, GONE),
      ),
    )
    .orderBy(desc(fcDnDossiers.createdAt))
    .limit(1);

  return row;
};

const lookUp = async (
  dn: DemarcheNumeriqueClient,
  config: DnConfig,
  history: HistoryRecorder,
  live: LiveDossier,
): Promise<DnDossierStatus | null> => {
  const elapsed = startTimer();

  try {
    const status = await dn.findByPrefillToken(config.demarcheNumber, live.prefillToken);

    await history.record({
      actor: "demarche_numerique",
      action: DN_STATE_ACTION,
      status: status ? "success" : "not_found",
      httpStatus: 200,
      durationMs: elapsed(),
      responsePayload: {
        dossier_number: live.dossierNumber,
        etat_avant: live.state,
        etat_apres: status?.state ?? GONE,
      },
    });

    return status;
  } catch (e) {
    await recordFailure(history, DN_STATE_ACTION, e, elapsed(), {
      dossierNumber: live.dossierNumber,
    });
    throw toJobError(e);
  }
};

const create = async (
  job: Job<FcDnDossierJobData>,
  data: FcDnDossierJobData,
  { db: database, dn, config }: { db: Database; dn: DemarcheNumeriqueClient; config: DnConfig },
  history: HistoryRecorder,
  sub: string,
): Promise<DnCreatedDossier | null> => {
  const lastRun = await findLastRunRows(database, sub);

  if (!lastRun.some((row) => row.verdict === "not_eligible")) {
    await skip(history, "aucun_refus");
    return null;
  }

  const results = toResourceResults(await loadApiRows(database, sub));
  const { body, filled } = buildPrefill({ identity: data.identity, results, lastRun }, config.champs);

  const elapsed = startTimer();
  let created: DnCreatedDossier;

  try {
    created = await dn.createPrefilledDossier(config.demarcheNumber, body);
  } catch (e) {
    await recordFailure(history, DN_PREFILL_ACTION, e, elapsed(), { bodyPayload: body });
    throw toJobError(e);
  }

  // The values exactly as pre-filled, before the usager edits any of them. Never the URL nor
  // its token.
  await history.record({
    actor: "demarche_numerique",
    action: DN_PREFILL_ACTION,
    status: "success",
    httpStatus: 201,
    durationMs: elapsed(),
    bodyPayload: body,
    responsePayload: {
      dossier_number: created.dossierNumber,
      dossier_id: created.dossierId,
      champs: filled,
    },
  });

  await job.updateData({ ...job.data, created });

  return created;
};

// Hands a FranceConnect user who contests a refusal their Démarche Numérique dossier: the live
// one when DN still lists it, otherwise a new one pre-filled from FranceConnect and the API
// Particulier answers already journaled. Never calls API Particulier.
export async function processFcDnDossierJob(
  job: Job<FcDnDossierJobData>,
  data: FcDnDossierJobData,
  deps: FcDnDossierDeps,
): Promise<FcDnDossierOutcome> {
  const { db: database, dn, config } = deps;

  if (!dn || !config) {
    throw new UnrecoverableError("Démarche Numérique is not configured on this worker");
  }

  const sub = data.identity?.sub ?? null;
  const history = await startJob(job, database, sub, data);

  if (!sub) {
    await skip(history, "sans_sub");
    return { outcome: "skipped", raison: "sans_sub" };
  }

  const live = await findLiveDossier(database, sub, config.demarcheNumber);

  if (live) {
    const status = await lookUp(dn, config, history, live);

    if (status) {
      await database
        .update(fcDnDossiers)
        .set({
          state: status.state,
          submittedAt: toDate(status.submittedAt),
          processedAt: toDate(status.processedAt),
        })
        .where(eq(fcDnDossiers.id, live.id));

      return { outcome: "refreshed", dossierNumber: live.dossierNumber, state: status.state };
    }

    await database.update(fcDnDossiers).set({ state: GONE }).where(eq(fcDnDossiers.id, live.id));
  }

  const created = data.created ?? (await create(job, data, { db: database, dn, config }, history, sub));

  if (!created) return { outcome: "skipped", raison: "aucun_refus" };

  const inserted = await database
    .insert(fcDnDossiers)
    .values({
      allocataireFcSub: sub,
      demarcheNumber: config.demarcheNumber,
      dossierNumber: created.dossierNumber,
      dossierId: created.dossierId,
      prefillToken: created.prefillToken,
      dossierUrl: created.dossierUrl,
      state: PREFILLED,
    })
    .onConflictDoNothing()
    .returning({ id: fcDnDossiers.id });

  if (inserted.length === 0) {
    console.warn(
      `[pass-sport-worker] job ${job.id}: dossier ${created.dossierNumber} already stored`,
    );
  }

  console.log(`[pass-sport-worker] job ${job.id}: dossier ${created.dossierNumber} pre-filled`);

  return {
    outcome: live ? "recreated" : "created",
    dossierNumber: created.dossierNumber,
    state: PREFILLED,
  };
}
