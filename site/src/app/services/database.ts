import { Pool } from 'pg';

const globalForPool = globalThis as unknown as { __applicationsPool?: Pool };

// The worker's database, read through the site_readonly role, which is only granted views.
export const getPool = (): Pool => {
  if (!globalForPool.__applicationsPool) {
    const connectionString = process.env.APPLICATIONS_DATABASE_URL;
    if (!connectionString) {
      throw new Error('APPLICATIONS_DATABASE_URL is missing');
    }
    const pool = new Pool({
      connectionString,
      // A page render must never hang on this lookup.
      connectionTimeoutMillis: 2_000,
      max: 4,
      ssl: process.env.PGSSL_DISABLE === 'true' ? undefined : { rejectUnauthorized: false },
    });

    pool.on('connect', () => {
      console.log('[pass-sport] applications database connection successful');
    });

    pool.on('error', (err) => {
      console.log(`[pass-sport] applications database connection failed: ${err.message}`);
    });
    globalForPool.__applicationsPool = pool;
  }

  return globalForPool.__applicationsPool;
};
