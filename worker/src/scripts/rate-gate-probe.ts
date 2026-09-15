// Replays one real API Particulier call, as many times as asked, through the rate gate. What the
// e2e suites cannot cover: they run against a fake client, so no byte ever leaves the machine.
//
//   pnpm apip:rate:probe
//   pnpm apip:rate:probe --calls 5
//   pnpm apip:rate:probe --id 1234

import "../load-env";
import pg from "pg";
import { Redis } from "ioredis";
import { RealClient } from "../eligibility/real-client";
import { toQfParams } from "../eligibility/client";
import {
  createRedisRateGate,
  minuteCounterKeyAt,
  secondCounterKeyAt,
} from "../eligibility/rate-gate";
import type { PivotIdentity, ResourceResult } from "../eligibility/types";

const REDIS_URL =
  process.env.FC_CODE_EMAILS_REDIS_URL ?? process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

const QF_ACTION = "dss.quotient_familial_identite";
const DEFAULT_CALLS = 20;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const numberOption = (argv: string[], flag: string, fallback: number): number => {
  const index = argv.indexOf(flag);

  if (index === -1) return fallback;

  const parsed = Number(argv[index + 1]);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} expects an integer >= 1, got "${argv[index + 1]}"`);
  }

  return parsed;
};

type HistoryRow = { id: string; created_at: Date; status: string; body_payload: Record<string, unknown> };

async function findCall(pool: pg.Pool, id: string | undefined): Promise<HistoryRow> {
  const { rows } = id
    ? await pool.query<HistoryRow>(
        "select id, created_at, status, body_payload from eligibility_history where id = $1",
        [id],
      )
    : await pool.query<HistoryRow>(
        `select id, created_at, status, body_payload
         from eligibility_history
         where actor = 'api_particulier' and action = $1
           and status in ('success', 'not_found') and body_payload is not null
         order by created_at desc
         limit 1`,
        [QF_ACTION],
      );

  const row = rows[0];

  if (!row) {
    throw new Error(
      `no replayable ${QF_ACTION} call in eligibility_history` +
        " — HISTORY_PAYLOAD=0 leaves body_payload empty, and there is nothing to replay without it",
    );
  }

  if (!row.body_payload) throw new Error(`history row ${row.id} carries no body_payload`);

  return row;
}

// Exact inverse of toDssParams/toQfParams. Checked against the stored payload before anything is
// called, so the probe cannot end up measuring the cadence of some other call.
function toIdentity(payload: Record<string, unknown>): PivotIdentity {
  const text = (key: string): string | undefined => {
    const value = payload[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };

  const prenoms = Array.isArray(payload.prenoms) ? (payload.prenoms as string[]) : [];
  const year = text("annee_date_naissance");
  const month = text("mois_date_naissance");
  const day = text("jour_date_naissance");
  const sexe = text("sexe_etat_civil");

  return {
    family_name: text("nom_naissance") ?? "",
    given_name: prenoms.join(" ") || undefined,
    gender: sexe === "M" ? "male" : sexe === "F" ? "female" : undefined,
    birthdate: year && month && day ? `${year}-${month}-${day}` : undefined,
    birthplace: text("code_cog_insee_commune_naissance"),
    birthcountry: text("code_cog_insee_pays_naissance"),
  };
}

const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return inner;

    return Object.fromEntries(
      Object.entries(inner as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  });

type Attempt = { blockedBy: string; waitedMs: number };

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const calls = numberOption(argv, "--calls", DEFAULT_CALLS);
  const id = argv.includes("--id") ? argv[argv.indexOf("--id") + 1] : undefined;

  if (id !== undefined && !id) throw new Error("--id expects an eligibility_history id");

  const pool = new pg.Pool({ connectionString: process.env.SCALINGO_POSTGRESQL_URL });
  const redis = new Redis(REDIS_URL);

  try {
    const row = await findCall(pool, id);
    const identity = toIdentity(row.body_payload);
    const mois = String(row.body_payload.mois ?? "");
    const rebuilt = toQfParams(identity, mois || undefined);

    if (stable(rebuilt) !== stable(row.body_payload)) {
      console.error("[probe] the rebuilt params do not match the recorded ones — nothing called");
      console.error(`  enregistré: ${stable(row.body_payload)}`);
      console.error(`  reconstruit: ${stable(rebuilt)}`);
      process.exitCode = 1;
      return;
    }

    const gate = createRedisRateGate(redis, {
      onLimitsChange: ({ perSecond, perMinute, isNight }) =>
        console.log(
          `[probe] plafonds: ${perSecond}/s, ${perMinute}/min (${isNight ? "nuit" : "jour"})`,
        ),
    });

    const client = new RealClient();

    console.log(
      `[probe] API Particulier ${process.env.API_PARTICULIER_ENV === "production" ? "production" : "staging"}` +
        `, ligne d'historique #${row.id} du ${new Date(row.created_at).toISOString()} (${row.status})`,
    );
    console.log(`[probe] champs rejoués: ${Object.keys(row.body_payload).sort().join(", ")}`);
    console.log(`[probe] ${calls} appels réels, mois de référence ${mois}\n`);

    const startedAt = Date.now();
    const waits: Attempt[] = [];
    let lastCallMs = startedAt;

    for (let call = 1; call <= calls; call++) {
      // The CLI stand-in for what the worker does on a refusal: it pauses the queue and requeues
      // the job, where here the process simply waits out the window.
      for (;;) {
        const slot = await gate.take();

        if (slot.allowed) break;

        waits.push({ blockedBy: slot.blockedBy, waitedMs: slot.retryInMs });
        console.log(
          `  [${String(call).padStart(2)}] attente ${(slot.retryInMs / 1000).toFixed(1)}s — fenêtre ${slot.blockedBy} pleine (${slot.perSecond}/s, ${slot.perMinute}/min)`,
        );
        await sleep(slot.retryInMs);
      }

      const calledAt = Date.now();
      lastCallMs = calledAt;
      const result: ResourceResult = await client.quotientFamilial(identity, mois || undefined);
      const durationMs = Date.now() - calledAt;

      console.log(
        `  [${String(call).padStart(2)}] +${String(calledAt - startedAt).padStart(6)}ms  http=${result.httpStatus ?? "-"}` +
          `  ${durationMs}ms  api_remaining=${result.rateLimitRemaining ?? "-"}` +
          `  api_reset=${result.rateLimitResetMs ?? "-"}${result.rateLimited ? "  ⚠ 429" : ""}`,
      );
    }

    const elapsedMs = Date.now() - startedAt;
    const bySecond = waits.filter((w) => w.blockedBy === "second").length;
    const byMinute = waits.filter((w) => w.blockedBy === "minute").length;

    console.log(`\n[probe] ${calls} appels en ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`[probe] pauses: ${bySecond} sur la fenêtre seconde, ${byMinute} sur la minute`);
    console.log(
      `[probe] cadence effective: ${((calls / elapsedMs) * 60_000).toFixed(1)} appels/min`,
    );

    // Read on the windows the LAST call landed in, not on "now": a second window rolls over
    // between the call and this line, and would report an empty counter.
    for (const [label, key] of [
      ["seconde", secondCounterKeyAt(lastCallMs)],
      ["minute", minuteCounterKeyAt(lastCallMs)],
    ] as const) {
      console.log(
        `[probe] compteur ${label} ${key} = ${await redis.get(key)} (pttl ${await redis.pttl(key)}ms)`,
      );
    }
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[probe]", err instanceof Error ? err.message : err);
  process.exit(1);
});
