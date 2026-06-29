import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let dbPromise: Promise<Db> | null = null;

const getConnectionString = (): string => {
  const url = process.env.DATABASE_URL ?? process.env.SCALINGO_POSTGRESQL_URL;
  if (!url) {
    throw new Error('DATABASE_URL (or SCALINGO_POSTGRESQL_URL) is missing');
  }
  return url;
};

export const getDb = (): Promise<Db> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const connectionString = getConnectionString();
      const [{ drizzle }, { default: postgres }] = await Promise.all([
        import('drizzle-orm/postgres-js'),
        import('postgres'),
      ]);

      // Scalingo Postgres requires TLS over a self-signed chain; disable locally via PGSSL_DISABLE.
      const ssl = process.env.PGSSL_DISABLE === 'true' ? false : ('require' as const);
      const client = postgres(connectionString, { max: 5, ssl });

      return drizzle(client, { schema });
    })();
  }

  return dbPromise;
};
