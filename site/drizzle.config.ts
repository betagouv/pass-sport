import type { Config } from 'drizzle-kit';

export default {
  schema: './src/app/services/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.SCALINGO_POSTGRESQL_URL ?? '',
  },
} satisfies Config;
