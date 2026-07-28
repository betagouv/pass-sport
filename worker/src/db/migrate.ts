import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";
import { pool as defaultPool } from "./client";

export async function runMigrations(pool: Pool = defaultPool): Promise<void> {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "drizzle" });
}

// Standalone entrypoint: `node dist/db/migrate.js` (postdeploy).
if (!process.env.VITEST && import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log("[pass-sport-worker] migrations applied");
      return defaultPool.end();
    })
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("[pass-sport-worker] migration failed:", err);
      process.exit(1);
    });
}
