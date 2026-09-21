// Rejoue les appels AEEH (dss.allocation_enfant_handicape_identite) restés en 422.
//
// Un 422 satisfait retryingWouldChangeNothing (eligibility/calls.ts), donc le job ne réessaie
// JAMAIS avec les mêmes params : la chaîne prononce sans AEEH et l'enfant sort en 'not_eligible'
// sans avoir été jugé. Le commit 5aee98d5 a ajouté une reprise sur le pays de naissance du
// parent (needsParentCountryRetry, eligibility/sequence.ts) dont ces enfants n'ont jamais
// bénéficié. Ce script rejoue leurs appels hors worker, avec exactement les mêmes règles.
//
// Rien n'est filtré ici : la requête de sélection fait tout le tri (voir SELECTION_SQL), le
// script lit, appelle, écrit.
//
// Les appels passent par callResource(), donc par le cadenceur Redis PARTAGÉ avec le site
// (apip:rate:*) : le rejeu ne consomme que ce que le site laisse libre, et `pnpm apip:rate` le
// ralentit à chaud.
//
// Les tunnels Scalingo sont à ouvrir À CÔTÉ, ce script ne les monte pas :
//   scalingo --app "$SCALINGO_APP" db-tunnel -p 10010 SCALINGO_POSTGRESQL_URL
//   scalingo --app "$SCALINGO_APP" db-tunnel -p 10011 SCALINGO_REDIS_URL
// puis exporter SCALINGO_POSTGRESQL_URL / FC_CODE_EMAILS_REDIS_URL réécrites vers 127.0.0.1.
//
// 10000/10001 sont les ports du passage FranceConnect, que la cron pass-sport-fc lance toutes
// les 30 minutes (run_fc_pipeline.sh) : les reprendre ici entrerait en collision avec lui. Le
// second db-tunnel meurt alors sur "address already in use" pendant que l'autre process croit
// son tunnel ouvert — son contrôle ne fait que tester le port, qui répond. Les deux se
// retrouvent sur le même tunnel, que le premier sorti referme sous les pieds du second.
//
// À lancer DEPUIS worker/ : load-env lit .env.local relativement au cwd.
//
//   pnpm exec tsx src/scripts/aeeh-422-replay.ts --dry-run
//   pnpm exec tsx src/scripts/aeeh-422-replay.ts --confirm
//   pnpm exec tsx src/scripts/aeeh-422-replay.ts --confirm --limit 5
import "../load-env";
import { createWriteStream } from "node:fs";
import { inspect } from "node:util";
import { stringify } from "csv-stringify";
import { Redis } from "ioredis";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "../db/client";
import { eligibilityResults } from "../db/schema";
import { createHistoryRecorder, type HistoryRecorder } from "../db/history";
import { callResource, type RateLimitable } from "../eligibility/calls";
import { createRedisRateGate } from "../eligibility/rate-gate";
import { RESOURCE_META, getClient, toDssParams } from "../eligibility/client";
import { needsParentCountryRetry, parentCountryIdentity } from "../eligibility/sequence";
import { childAeehVerdict } from "../eligibility/verdicts";
import {
  AEEH_BIRTHDATE_MAX,
  AEEH_BIRTHDATE_MIN,
  ALLOWANCE,
  FRANCE_COG_INSEE,
  toResultSituation,
  type AllocationEnfantHandicapeData,
  type PivotIdentity,
  type ResourceResult,
} from "../eligibility/types";

const LOG_PREFIX = "[aeeh-422-replay]";

// La borne demandée : les appels postérieurs relèvent déjà du worker corrigé.
const DEFAULT_BEFORE = "2026-09-18T11:09:24.825615+02:00";

// Dry run : un échantillon d'appels RÉELS, espacés, et aucune écriture en base.
const DEFAULT_SAMPLE = 10;
const DEFAULT_DRY_RUN_SPACING_MS = 800;

// Une fenêtre pleine se rouvre en au plus une minute et gatedCall dort jusque-là, donc ce
// plafond ne se voit que si Redis ment ou si le site sature des heures durant.
const MAX_GATE_RETRIES = 1_000;

const REDIS_URL = process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// --- Journal ------------------------------------------------------------------------------
// Il n'y a pas de logger dans ce dépôt : tout passe par console.*, y compris à l'intérieur de
// callResource. Envelopper console est donc le seul moyen de capturer la trace du cadenceur et
// des appels dans un fichier sans toucher aux modules partagés.

type ConsoleLevel = "log" | "info" | "warn" | "error";

let logStream: ReturnType<typeof createWriteStream> | null = null;

const formatArg = (value: unknown): string =>
  typeof value === "string" ? value : inspect(value, { depth: 4 });

function teeConsole(logPath: string): void {
  logStream = createWriteStream(logPath, { flags: "a" });

  for (const level of ["log", "info", "warn", "error"] as ConsoleLevel[]) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      original(...args);
      logStream?.write(
        `${new Date().toISOString()} ${level.toUpperCase()} ${args.map(formatArg).join(" ")}\n`,
      );
    };
  }
}

async function closeLog(): Promise<void> {
  const stream = logStream;
  if (!stream) return;
  logStream = null;
  await new Promise<void>((resolve) => stream.end(() => resolve()));
}

// --- Options ------------------------------------------------------------------------------

type Options = {
  dryRun: boolean;
  before: string;
  sample: number | null;
  spacingMs: number;
  limit: number | null;
  outPath: string;
  logPath: string;
};

const USAGE =
  "usage: tsx src/scripts/aeeh-422-replay.ts [--dry-run | --confirm] [--before <iso>] " +
  "[--sample N] [--spacing-ms N] [--limit N] [--out <path>] [--log <path>]";

const valueOf = (argv: string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
};

const positiveIntOf = (argv: string[], flag: string): number | undefined => {
  const raw = valueOf(argv, flag);
  if (raw === undefined) return undefined;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} attend un entier positif, reçu "${raw ?? ""}"`);
  }
  return parsed;
};

function parseOptions(argv: string[]): Options {
  const dryRun = argv.includes("--dry-run");

  // Un run réel écrit en base de production : il ne part pas sur une ligne de commande nue.
  if (!dryRun && !argv.includes("--confirm")) {
    throw new Error("hors --dry-run, --confirm est obligatoire (le run réel écrit en base)");
  }

  const before = valueOf(argv, "--before") ?? DEFAULT_BEFORE;
  if (Number.isNaN(Date.parse(before))) {
    throw new Error(`--before attend une date ISO, reçu "${before}"`);
  }

  const spacing = positiveIntOf(argv, "--spacing-ms");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return {
    dryRun,
    before,
    // L'échantillon ne borne que le dry run : un run réel doit couvrir toute la sélection.
    sample: dryRun ? (positiveIntOf(argv, "--sample") ?? DEFAULT_SAMPLE) : null,
    // Un plancher entre deux appels, EN PLUS du cadenceur. Nul par défaut hors dry run : le
    // gate Redis est alors seul juge du rythme.
    spacingMs: spacing ?? (dryRun ? DEFAULT_DRY_RUN_SPACING_MS : 0),
    limit: positiveIntOf(argv, "--limit") ?? null,
    outPath: valueOf(argv, "--out") ?? `aeeh-422-replay-${stamp}.csv`,
    logPath: valueOf(argv, "--log") ?? `aeeh-422-replay-${stamp}.log`,
  };
}

// --- Sélection ----------------------------------------------------------------------------
// String.raw : les classes \d des expressions rationnelles ne doivent pas être mangées par
// l'échappement du littéral.

const SELECTION_SQL = String.raw`
with aeeh as (
  select h.*
  from eligibility_history h
  where h.action = 'dss.allocation_enfant_handicape_identite'
    and h.allocataire_fc_sub is not null
),

-- « jamais abouti » : au niveau du sub, aucun appel AEEH n'a jamais répondu 200.
never_ok as (
  select distinct a.allocataire_fc_sub
  from aeeh a
  where a.allocataire_fc_sub not in (
    select s.allocataire_fc_sub from aeeh s
    where s.http_status = 200 or s.status = 'success'
  )
),

-- « le dernier appel » : le 422 le plus récent du sub, avant la borne.
last_422 as (
  select distinct on (a.allocataire_fc_sub) a.*
  from aeeh a
  join never_ok n using (allocataire_fc_sub)
  where a.http_status = 422
    and a.created_at < $1::timestamptz
  order by a.allocataire_fc_sub, a.created_at desc, a.id
),

-- Les enfants à rejouer. TOUTES les portes sont ici, pour que le script n'ait rien à trier :
--   - verdict refusé : le périmètre du rejeu. Une ligne 'eligible_pending' ou
--     'eligible_confirmed' a déjà son droit (route QF, ou code servi par data/) ;
--   - is_eligible / pass_sport_code : la garde d'idempotence de writeback_verdict.sql, qui
--     écarte au passage une ligne incohérente plutôt que de la faire arbitrer par le script ;
--   - nom + prénoms + date de naissance : la condition exacte de enfantToIdentity
--     (eligibility/sequence.ts) — sans les trois, aucun appel n'est formable ;
--   - fenêtre AEEH : comparaison TEXTUELLE, exactement isWithinBirthdateWindow
--     (eligibility/types.ts) ; un birthdate NULL tombe de lui-même avec le BETWEEN.
enfants as (
  select
    l.allocataire_fc_sub, l.job_id, l.id as history_id, l.attempt,
    l.created_at as history_created_at, l.http_status as http_status_avant,
    l.error as erreur_avant, l.response_payload->'api_error' as api_error,
    r.id as eligibility_result_id, r.enfant_identite, r.allocataire_identite,
    r.is_eligible, r.verdict, r.situation, r.created_at as result_created_at,
    lower(btrim(r.enfant_identite->>'family_name')) || '|' ||
    lower(btrim(r.enfant_identite->>'given_name'))  || '|' ||
    (r.enfant_identite->>'birthdate') as enfant_key
  from last_422 l
  join eligibility_results r
    on r.job_id = l.job_id
   and r.source = 'enfant'
  where r.verdict = 'not_eligible'
    and r.is_eligible = false
    and r.pass_sport_code is null
    and nullif(btrim(r.enfant_identite->>'family_name'), '') is not null
    and nullif(btrim(r.enfant_identite->>'given_name'), '')  is not null
    and r.enfant_identite->>'birthdate' between $2 and $3
),

-- L'ordre d'insertion des lignes enfant n'est pas récupérable (uuid aléatoire, même created_at
-- pour toute la transaction) : la dernière réponse quotient_familial réussie du job est la
-- seule source de l'ordre des enfants.
qf as (
  select distinct on (h.job_id)
         h.job_id, h.response_payload->'data'->'enfants' as liste
  from eligibility_history h
  where h.job_id in (select job_id from enfants)
    and h.action like 'dss.quotient_familial%'
    and h.status = 'success'
    and jsonb_typeof(h.response_payload->'data'->'enfants') = 'array'
  order by h.job_id, h.created_at desc, h.id
),

-- Même clé que ci-dessus, la date normalisée comme toIsoDate : l'API rend soit "JJ/MM/AAAA",
-- soit de l'ISO.
qf_enfants as (
  select
    q.job_id,
    (e.ordinality - 1)::int as child_index,
    lower(btrim(coalesce(e.value->>'nom_naissance', ''))) || '|' ||
    lower(btrim(coalesce(e.value->>'prenoms', '')))       || '|' ||
    coalesce(
      case
        when e.value->>'date_naissance' ~ '^\d{2}/\d{2}/\d{4}$'
          then substr(e.value->>'date_naissance', 7, 4) || '-' ||
               substr(e.value->>'date_naissance', 4, 2) || '-' ||
               substr(e.value->>'date_naissance', 1, 2)
        when e.value->>'date_naissance' ~ '^\d{4}-\d{2}-\d{2}'
          then left(e.value->>'date_naissance', 10)
      end, '') as enfant_key
  from qf q
  cross join lateral jsonb_array_elements(q.liste) with ordinality as e(value, ordinality)
)

select e.*, qe.child_index
from enfants e
left join qf_enfants qe
  on qe.job_id = e.job_id and qe.enfant_key = e.enfant_key
order by e.history_created_at desc, e.result_created_at, e.eligibility_result_id
limit $4
`;

type EnfantIdentite = {
  family_name?: string;
  given_name?: string;
  birthdate?: string;
  gender?: "male" | "female";
  preferred_username?: string;
};

type SelectionRow = {
  allocataire_fc_sub: string;
  job_id: string | null;
  history_id: string;
  attempt: number;
  history_created_at: Date;
  http_status_avant: number | null;
  erreur_avant: string | null;
  api_error: unknown;
  eligibility_result_id: string;
  enfant_identite: EnfantIdentite;
  allocataire_identite: PivotIdentity | null;
  is_eligible: boolean;
  verdict: string;
  situation: string | null;
  result_created_at: Date;
  enfant_key: string;
  child_index: number | null;
};

// --- CSV ----------------------------------------------------------------------------------
// Une ligne par enfant, écrite au fil de l'eau : un arrêt en cours de route laisse un fichier
// exploitable plutôt qu'un fichier vide.

const CSV_COLUMNS = [
  "allocataire_fc_sub",
  "job_id",
  "eligibility_result_id",
  "child_index",
  "enfant_nom_naissance",
  "enfant_prenoms",
  "enfant_date_naissance",
  "enfant_sexe",
  "parent_pays_naissance",
  "history_id_422",
  "history_created_at_422",
  "http_status_avant",
  "erreur_avant",
  "is_eligible_avant",
  "verdict_avant",
  "situation_avant",
  "appels",
  "http_status_1",
  "http_status_2",
  "aeeh_status",
  "erreur_apres",
  "is_eligible_apres",
  "verdict_apres",
  "situation_apres",
  "mis_a_jour",
  "decision",
  "raison",
  "params_1",
  "params_2",
] as const;

type CsvRecord = Record<(typeof CSV_COLUMNS)[number], string>;

async function writeCsvRow(
  stringifier: ReturnType<typeof stringify>,
  record: CsvRecord,
): Promise<void> {
  if (!stringifier.write(record)) {
    await new Promise<void>((resolve) => stringifier.once("drain", () => resolve()));
  }
}

async function closeCsv(
  stringifier: ReturnType<typeof stringify>,
  stream: ReturnType<typeof createWriteStream>,
): Promise<void> {
  stringifier.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", (error) => reject(error));
  });
}

// --- Rejeu --------------------------------------------------------------------------------

// enfantToIdentity (eligibility/sequence.ts) : aucune commune — le lieu de naissance du parent
// ne dit rien de celui de l'enfant — et le pays part à la France, que l'AEEH exige.
const childIdentity = (enfant: EnfantIdentite): PivotIdentity => ({
  family_name: enfant.family_name as string,
  given_name: enfant.given_name,
  gender: enfant.gender,
  birthdate: enfant.birthdate,
  birthcountry: FRANCE_COG_INSEE,
});

const isRateLimitError = (e: unknown): boolean => e instanceof Error && e.name === "RateLimitError";

const aeehStatus = (r: ResourceResult | undefined): string =>
  (r?.data as AllocationEnfantHandicapeData | null)?.status ?? "";

// Ce qui reste d'un appel une fois la question posée : soit un verdict, soit un refus.
type Decision = "verdict_releve" | "verdict_inchange" | "ignore" | "erreur";

type Outcome = {
  calls: ResourceResult[];
  decision: Decision;
  raison: string;
  verdict: boolean | null;
};

async function main(): Promise<void> {
  let options: Options;

  try {
    options = parseOptions(process.argv.slice(2));
  } catch (e) {
    console.error(`${LOG_PREFIX} ${(e as Error).message}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  teeConsole(options.logPath);

  // Un rejeu parti sur staging ne vaut rien, et l'hôte Redis dit contre quel cadenceur il
  // s'aligne. Ni le mot de passe ni le jeton ne sont journalisés.
  const redisHost = (() => {
    try {
      const url = new URL(REDIS_URL);
      return `${url.protocol}//${url.hostname}:${url.port || "6379"}`;
    } catch {
      return "url illisible";
    }
  })();

  console.log(
    `${LOG_PREFIX} ${options.dryRun ? "DRY RUN" : "RUN RÉEL"} — API Particulier ` +
      `env=${process.env.API_PARTICULIER_ENV === "production" ? "production" : "staging"}, ` +
      `redis=${redisHost}, borne=${options.before}` +
      (options.limit ? `, limit=${options.limit}` : "") +
      (options.sample ? `, échantillon=${options.sample} appels` : "") +
      (options.spacingMs ? `, plancher=${options.spacingMs}ms` : ""),
  );
  console.log(`${LOG_PREFIX} journal=${options.logPath} csv=${options.outPath}`);

  const redis = new Redis(REDIS_URL);
  const csvStream = createWriteStream(options.outPath, { flags: "w" });
  const csv = stringify({ header: true, columns: [...CSV_COLUMNS] });
  csv.pipe(csvStream);

  try {
    // Le gate partagé, sur une connexion qui échoue vite : callResource fait une pause de 10 s
    // quand il ne répond pas, et c'est mieux qu'une attente indéfinie.
    const rateGate = createRedisRateGate(redis, {
      onLimitsChange: (limits) =>
        console.log(
          `${LOG_PREFIX} plafonds: ${limits.perSecond}/s, ${limits.perMinute}/min` +
            `${limits.isNight ? " (nuit)" : ""}`,
        ),
    });

    const selection = await pool.query<SelectionRow>(SELECTION_SQL, [
      options.before,
      AEEH_BIRTHDATE_MIN,
      AEEH_BIRTHDATE_MAX,
      options.limit,
    ]);
    const rows = selection.rows;

    console.log(`${LOG_PREFIX} ${rows.length} enfant(s) à rejouer`);

    // Après la sélection : un jeton absent doit se voir sans avoir attendu la requête, et le
    // compte des enfants est ce qu'on veut lire en premier dans le journal.
    const client = await getClient();

    // Le run lui-même est historisé, hors de tout sub : c'est la convention de
    // fc_code_emails.run_started / run_finished.
    const runHistory: HistoryRecorder = options.dryRun
      ? { record: async () => {} }
      : createHistoryRecorder(db, { allocataireFcSub: null, jobId: null, attempt: 0 });

    await runHistory.record({
      actor: "worker",
      action: "aeeh.replay.run_started",
      status: "success",
      responsePayload: { selected: rows.length, before: options.before, limit: options.limit },
    });

    const stats = { enfants: 0, appels: 0, releves: 0, inchanges: 0, ignores: 0, erreurs: 0 };

    // Le plafond porte sur les APPELS, pas sur les enfants : un enfant en coûte un ou deux.
    let exhausted = false;
    const reserveCall = (): boolean => {
      if (options.sample != null && stats.appels >= options.sample) {
        exhausted = true;
        return false;
      }
      stats.appels += 1;
      return true;
    };

    let lastCallAt = 0;

    // callResource ne dépend de BullMQ que par RateLimitable : lui passer un adaptateur qui
    // DORT au lieu de remettre en file suffit à rejouer, hors worker, la prise de slot sur le
    // cadenceur partagé, la pause jusqu'à la réouverture de la fenêtre, le 429 et la pause
    // proactive sur remaining=0 — et l'écriture de la ligne d'historique de l'appel.
    const pacer: RateLimitable = { rateLimit: async (ms) => sleep(ms) };

    const gatedCall = async (
      identity: PivotIdentity,
      row: SelectionRow,
      history: HistoryRecorder,
    ): Promise<ResourceResult> => {
      for (let attempt = 0; attempt < MAX_GATE_RETRIES; attempt += 1) {
        // Plancher entre deux appels, en plus du cadenceur : c'est ce qui étale l'échantillon
        // du dry run. Mesuré depuis l'appel précédent, pauses du gate comprises.
        const since = Date.now() - lastCallAt;
        if (options.spacingMs > 0 && since < options.spacingMs) {
          await sleep(options.spacingMs - since);
        }
        lastCallAt = Date.now();

        try {
          return await callResource({
            jobId: row.job_id ?? undefined,
            queue: pacer,
            history,
            rateGate,
            resource: RESOURCE_META.aeeh.resource,
            subject: "enfant",
            logSuffix: ` (result ${row.eligibility_result_id})`,
            params: toDssParams(identity),
            invoke: () => client.aeeh(identity, row.child_index ?? 0),
          });
        } catch (e) {
          // pauseAndResume a déjà fait dormir le pacer : il ne reste qu'à redemander un slot.
          if (isRateLimitError(e)) continue;
          throw e;
        }
      }

      throw new Error(`cadenceur toujours plein après ${MAX_GATE_RETRIES} tentatives`);
    };

    // La boucle de sequence.ts, sans le checkpoint BullMQ : un appel, et un second sur le pays
    // du parent quand la règle du worker le demande.
    const replayChild = async (row: SelectionRow, history: HistoryRecorder): Promise<Outcome> => {
      if (!reserveCall()) {
        return { calls: [], decision: "ignore", raison: "echantillon_atteint", verdict: null };
      }

      const child = childIdentity(row.enfant_identite);
      const calls = [await gatedCall(child, row, history)];
      const parent = row.allocataire_identite;

      if (parent && needsParentCountryRetry(calls[0], parent)) {
        if (reserveCall()) {
          calls.push(await gatedCall(parentCountryIdentity(child, parent), row, history));
        }
      }

      // Le DERNIER appel décide, comme findChildResource (eligibility/verdicts.ts).
      const last = calls[calls.length - 1];
      const verdict = childAeehVerdict(last);

      if (verdict === true) return { calls, decision: "verdict_releve", raison: "", verdict };

      const raison =
        verdict === false
          ? "non_beneficiaire"
          : last.httpStatus === 422
            ? "refus_persistant"
            : "appel_impossible";

      return { calls, decision: "verdict_inchange", raison, verdict };
    };

    for (const row of rows) {
      stats.enfants += 1;

      const history: HistoryRecorder = options.dryRun
        ? { record: async () => {} }
        : createHistoryRecorder(db, {
            allocataireFcSub: row.allocataire_fc_sub,
            jobId: row.job_id,
            // Il n'y a pas de tentative BullMQ ici : ce n'est pas un rejeu de job.
            attempt: 0,
          });

      let outcome: Outcome;

      try {
        outcome = exhausted
          ? { calls: [], decision: "ignore", raison: "echantillon_atteint", verdict: null }
          : await replayChild(row, history);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`${LOG_PREFIX} ${row.eligibility_result_id}: ${message}`);
        outcome = { calls: [], decision: "erreur", raison: message, verdict: null };
      }

      // Seul un droit ouvert écrit, et jamais par-dessus une ligne qui a bougé entre-temps :
      // mêmes gardes que writeback_verdict.sql. Un UPDATE unique est déjà atomique, une
      // transaction autour n'ajouterait rien — l'historique, lui, doit rester hors transaction
      // (db/history.ts) pour survivre à un échec.
      let updated = false;

      if (outcome.verdict === true && !options.dryRun) {
        const written = await db
          .update(eligibilityResults)
          .set({
            isEligible: true,
            verdict: "eligible_pending",
            situation: toResultSituation(ALLOWANCE.AEEH),
          })
          .where(
            and(
              eq(eligibilityResults.id, row.eligibility_result_id),
              eq(eligibilityResults.verdict, "not_eligible"),
              eq(eligibilityResults.isEligible, false),
              isNull(eligibilityResults.passSportCode),
            ),
          )
          .returning({ id: eligibilityResults.id });

        updated = written.length > 0;
      }

      if (outcome.decision === "verdict_releve") stats.releves += 1;
      else if (outcome.decision === "verdict_inchange") stats.inchanges += 1;
      else if (outcome.decision === "ignore") stats.ignores += 1;
      else stats.erreurs += 1;

      const situationApres = outcome.verdict === true ? toResultSituation(ALLOWANCE.AEEH) : "";
      const verdictApres = outcome.verdict === true ? "eligible_pending" : "";

      await history.record({
        actor: "worker",
        action: "aeeh.replay",
        status: outcome.decision === "erreur" ? "error" : outcome.calls.length ? "success" : "skipped",
        subject: "enfant",
        error: outcome.decision === "erreur" ? outcome.raison : undefined,
        responsePayload: {
          eligibility_result_id: row.eligibility_result_id,
          child_index: row.child_index,
          appels: outcome.calls.length,
          http_statuses: outcome.calls.map((c) => c.httpStatus ?? null),
          aeeh_status: aeehStatus(outcome.calls[outcome.calls.length - 1]) || null,
          decision: outcome.decision,
          raison: outcome.raison || null,
          verdict_avant: row.verdict,
          verdict_apres: verdictApres || row.verdict,
          is_eligible_avant: row.is_eligible,
          is_eligible_apres: outcome.verdict === true,
          situation_avant: row.situation,
          situation_apres: situationApres || row.situation,
          updated,
        },
      });

      const last = outcome.calls[outcome.calls.length - 1];

      await writeCsvRow(csv, {
        allocataire_fc_sub: row.allocataire_fc_sub,
        job_id: row.job_id ?? "",
        eligibility_result_id: row.eligibility_result_id,
        child_index: row.child_index?.toString() ?? "",
        enfant_nom_naissance: row.enfant_identite.family_name ?? "",
        enfant_prenoms: row.enfant_identite.given_name ?? "",
        enfant_date_naissance: row.enfant_identite.birthdate ?? "",
        enfant_sexe: row.enfant_identite.gender ?? "",
        parent_pays_naissance: row.allocataire_identite?.birthcountry ?? "",
        history_id_422: row.history_id,
        history_created_at_422: row.history_created_at.toISOString(),
        http_status_avant: row.http_status_avant?.toString() ?? "",
        erreur_avant: row.erreur_avant ?? "",
        is_eligible_avant: String(row.is_eligible),
        verdict_avant: row.verdict,
        situation_avant: row.situation ?? "",
        appels: String(outcome.calls.length),
        http_status_1: outcome.calls[0]?.httpStatus?.toString() ?? "",
        http_status_2: outcome.calls[1]?.httpStatus?.toString() ?? "",
        aeeh_status: aeehStatus(last),
        erreur_apres: last?.error ?? "",
        // Ce qu'un run réel aurait écrit : en dry run ces colonnes sont la seule sortie.
        is_eligible_apres: outcome.verdict === true ? "true" : "",
        verdict_apres: verdictApres,
        situation_apres: situationApres,
        mis_a_jour: String(updated),
        decision: outcome.decision,
        raison: outcome.raison,
        params_1: outcome.calls[0] ? JSON.stringify(toDssParams(childIdentity(row.enfant_identite))) : "",
        params_2:
          outcome.calls[1] && row.allocataire_identite
            ? JSON.stringify(
                toDssParams(
                  parentCountryIdentity(childIdentity(row.enfant_identite), row.allocataire_identite),
                ),
              )
            : "",
      });
    }

    await runHistory.record({
      actor: "worker",
      action: "aeeh.replay.run_finished",
      status: "success",
      responsePayload: { ...stats, dry_run: options.dryRun, sample_exhausted: exhausted },
    });

    console.log(
      `${LOG_PREFIX} terminé: ${stats.enfants} enfant(s), ${stats.appels} appel(s), ` +
        `${stats.releves} verdict(s) relevé(s), ${stats.inchanges} inchangé(s), ` +
        `${stats.ignores} ignoré(s), ${stats.erreurs} erreur(s)` +
        (options.dryRun ? " — DRY RUN, rien n'a été écrit en base" : ""),
    );
    console.log(
      `${LOG_PREFIX} ${options.outPath} et ${options.logPath} portent des noms et dates de ` +
        "naissance d'enfants, au même titre que eligibility_history — à traiter comme tels",
    );
  } finally {
    await closeCsv(csv, csvStream);
    await pool.end();
    redis.disconnect();
    await closeLog();
  }
}

main().catch((error: unknown) => {
  console.error(LOG_PREFIX, error);
  process.exit(1);
});
