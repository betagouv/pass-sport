import type { Config } from "drizzle-kit";

// Optional: `pnpm drizzle-kit generate` emits SQL migrations into ./drizzle from
// the schema. The worker itself bootstraps via db/migrate.ts (CREATE TABLE IF NOT
// EXISTS) at startup, so this is only needed if you want managed migration history.
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.SCALINGO_POSTGRESQL_URL ??
      "postgres://passport:passport@localhost:5432/passport",
  },
} satisfies Config;
