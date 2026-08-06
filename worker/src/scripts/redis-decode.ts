// Read-only inspector for what the pipeline stores in Redis.
//
//   pnpm redis:decode                     # every key, identities masked
//   pnpm redis:decode 'bull:codes-queue:*'
//   pnpm redis:decode --reveal            # identities in clear (see below)
//   pnpm redis:decode 'poc:fc:session:*' --reveal --limit 5
//
// --reveal prints real identités pivot: names, birthdates, children, email addresses.
// Same posture as logPii/LOG_PII — off unless explicitly asked for, because this is
// production personal data and terminal scrollback is not a safe place for it.
// Masking uses a field-name denylist (PII_FIELDS below); a new personal field added
// upstream will NOT be masked until it is listed there.
//
// Writes nothing, ever: SCAN/GET/HGETALL only.

import "../load-env";
import { Redis } from "ioredis";

type AnyRecord = Record<string, unknown>;

const SCALINGO_REDIS_URL =
  process.env.SCALINGO_REDIS_URL ?? "redis://localhost:6379";

// Field names whose values are personal data, masked unless --reveal.
const PII_FIELDS = new Set([
  "family_name",
  "given_name",
  "preferred_username",
  "birthdate",
  "email",
  "courriel",
  "nom",
  "prenom",
  "prenoms",
  "nom_naissance",
  "nom_usage",
  "date_naissance",
  "adresse",
  "telephone",
  "matricule",
  "id_psp",
]);

const mask = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  if (value.length <= 2) return "**";
  return `${value[0]}${"*".repeat(Math.min(value.length - 1, 8))}`;
};

const redact = (value: unknown, reveal: boolean): unknown => {
  if (reveal || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, reveal));
  return Object.fromEntries(
    Object.entries(value as AnyRecord).map(([k, v]) => [
      k,
      PII_FIELDS.has(k) ? mask(v) : redact(v, reveal),
    ]),
  );
};

const show = (label: string, value: unknown, reveal: boolean): void => {
  console.log(`  ${label}:`);
  console.log(
    JSON.stringify(redact(value, reveal), null, 2)
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  );
};

const fail = (label: string, e: unknown): void => {
  console.log(`  ${label}: <illisible — ${(e as Error).message}>`);
};

// A BullMQ job hash (main queue or DLQ): the job payload and the API Particulier
// checkpoint. DLQ entries carry extra bookkeeping alongside the payload.
const decodeJobHash = (hash: Record<string, string>, reveal: boolean): void => {
  let data: AnyRecord;
  try {
    data = JSON.parse(hash.data ?? "{}") as AnyRecord;
  } catch {
    console.log("  data: <JSON illisible>");
    return;
  }

  const META = ["originalJobId", "originalJobName", "failedReason", "failedAt", "attemptsMade"];

  for (const meta of META) {
    if (data[meta] !== undefined) console.log(`  ${meta}: ${String(data[meta])}`);
  }

  if (hash.failedReason) console.log(`  failedReason: ${hash.failedReason}`);

  const { checkpoint, ...payload } = data;

  show("payload", Object.fromEntries(Object.entries(payload).filter(([k]) => !META.includes(k))), reveal);

  if (checkpoint !== undefined) {
    show("checkpoint", checkpoint, reveal);
  }

  if (hash.returnvalue) {
    try {
      show("returnvalue", JSON.parse(hash.returnvalue), reveal);
    } catch {
      console.log(`  returnvalue: ${hash.returnvalue}`);
    }
  }
};

// POC FranceConnect session, written by the site (.../callback/route.ts).
const decodeSession = (raw: string, reveal: boolean): void => {
  try {
    show("session", JSON.parse(raw), reveal);
  } catch {
    console.log(`  <JSON illisible> ${raw}`);
  }
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: redis-decode [pattern] [--reveal] [--limit N]");
    return;
  }

  const reveal = argv.includes("--reveal");
  const limitIdx = argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(argv[limitIdx + 1]) : Number.POSITIVE_INFINITY;

  // Positional = anything that is neither a flag nor the value consumed by --limit.
  const consumed = new Set<number>();

  if (limitIdx >= 0) {
    consumed.add(limitIdx);
    consumed.add(limitIdx + 1);
  }

  const pattern =
    argv.find((a, i) => !consumed.has(i) && !a.startsWith("--")) ?? "*";

  const redis = new Redis(SCALINGO_REDIS_URL, { maxRetriesPerRequest: null });

  if (!reveal) {
    console.log("(identités masquées — utiliser --reveal pour les afficher en clair)\n");
  }

  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0" && keys.length < limit);
  keys.sort();

  let shown = 0;
  for (const key of keys) {
    if (shown >= limit) break;
    const type = await redis.type(key);
    const ttl = await redis.ttl(key);
    console.log(`\n=== ${key}  [${type}] ttl=${ttl === -1 ? "∞" : `${ttl}s`}`);
    shown += 1;

    if (type === "hash" && /^bull:[^:]+:[^:]+$/.test(key)) {
      decodeJobHash(await redis.hgetall(key), reveal);
      continue;
    }
    if (key.startsWith("poc:fc:session:")) {
      decodeSession((await redis.get(key)) ?? "", reveal);
      continue;
    }
    // Everything else holds no personal data: markers, counters, BullMQ bookkeeping.
    if (type === "string") console.log(`  ${await redis.get(key)}`);
    else if (type === "hash") show("hash", await redis.hgetall(key), reveal);
    else if (type === "zset") show("zset", await redis.zrange(key, 0, -1, "WITHSCORES"), reveal);
    else if (type === "list") show("list", await redis.lrange(key, 0, -1), reveal);
    else if (type === "set") show("set", await redis.smembers(key), reveal);
    else console.log(`  <type ${type} non affiché>`);
  }

  console.log(`\n${shown} clé(s)`);
  await redis.quit();
}

main().catch((err: unknown) => {
  console.error("[redis-decode]", err);
  process.exit(1);
});
