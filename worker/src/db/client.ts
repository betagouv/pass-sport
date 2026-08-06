import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const SCALINGO_POSTGRESQL_URL =
  process.env.SCALINGO_POSTGRESQL_URL ??
  "postgres://passport:passport@localhost:5432/passport";

export const pool = new pg.Pool({ connectionString: SCALINGO_POSTGRESQL_URL });
export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });
