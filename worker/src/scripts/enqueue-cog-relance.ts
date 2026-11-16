// Relance groupée des usagers FranceConnect nés sur un code commune que l'API Particulier ne
// reconnaissait pas (Corse 20xxx avant 1976, Mayotte 985xx avant 2011). Sélection, ouverture de
// relance_allowed et mise en file : voir cog-relance.ts. Le jugement lui-même est celui de
// fc-relance, sur le worker.
//
// PRÉREQUIS : le worker en production porte eligibility/birthplace.ts. Sans lui, la relance
// renvoie 20xxx et reprend le même 422.
//
// Les tunnels Scalingo sont à ouvrir À CÔTÉ (pas sur 10000/10001, pris par run_fc_pipeline.sh) :
//   scalingo --app "$SCALINGO_APP" db-tunnel -p 10010 SCALINGO_POSTGRESQL_URL
//   scalingo --app "$SCALINGO_APP" db-tunnel -p 10011 SCALINGO_REDIS_URL
// puis exporter SCALINGO_POSTGRESQL_URL / FC_CODE_EMAILS_REDIS_URL réécrites vers 127.0.0.1.
//
// À lancer DEPUIS worker/ :
//   pnpm cog:relance --dry-run
//   pnpm cog:relance --confirm --limit 5
//   pnpm cog:relance --confirm
import "../load-env";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { pool } from "../db/client";
import { FRANCE_CONNECT_QUEUE_NAME } from "../queues";
import type { EligibilityJobData } from "../eligibility/types";
import { enqueueCogRelance, selectCogRelanceTargets } from "./cog-relance";

const LOG_PREFIX = "[enqueue-cog-relance]";

const REDIS_URL =
  process.env.FC_CODE_EMAILS_REDIS_URL ?? process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

const readLimit = (argv: string[]): number | undefined => {
  const index = argv.indexOf("--limit");
  if (index === -1) return undefined;

  const parsed = Number(argv[index + 1]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--limit expects a positive integer, got "${argv[index + 1]}"`);
  }

  return parsed;
};

const motif = (birthplace: string | undefined): string =>
  birthplace?.startsWith("20") ? "corse" : "mayotte";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const confirm = argv.includes("--confirm");

  if (dryRun === confirm) {
    throw new Error("pass exactly one of --dry-run or --confirm");
  }

  const targets = await selectCogRelanceTargets(pool, readLimit(argv));
  const corse = targets.filter((t) => motif(t.identity.birthplace) === "corse").length;

  console.log(
    `${LOG_PREFIX} ${targets.length} usager(s) ciblé(s) — corse: ${corse}, mayotte: ${targets.length - corse}`,
  );

  if (dryRun) {
    for (const { sub, identity } of targets) console.log(`${sub}\t${identity.birthplace}`);
    return;
  }

  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<EligibilityJobData>(FRANCE_CONNECT_QUEUE_NAME, { connection });

  try {
    const { enqueued, busy } = await enqueueCogRelance(pool, queue, targets);

    console.log(`${LOG_PREFIX} ${enqueued.length} relance(s) en file, ${busy.length} écartée(s) (job en cours)`);
    for (const sub of busy) console.log(`${LOG_PREFIX} job en cours, écarté : ${sub}`);
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

main()
  .catch((err: unknown) => {
    console.error(`${LOG_PREFIX} failed:`, err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
