import { createHash } from 'crypto';
import { Pool } from 'pg';
import * as Sentry from '@sentry/nextjs';
import type { ApiParticulierJobData } from '@/app/services/eligibility-job';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const globalForPool = globalThis as unknown as { __verificationPool?: Pool };
const getPool = (): Pool => {
  if (!globalForPool.__verificationPool) {
    const connectionString = process.env.APPLICATIONS_DATABASE_URL;
    if (!connectionString) {
      throw new Error('APPLICATIONS_DATABASE_URL is missing');
    }
    globalForPool.__verificationPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 2_000,
      max: 4,
      ssl: process.env.PGSSL_DISABLE === 'true' ? undefined : { rejectUnauthorized: false },
    });
  }

  return globalForPool.__verificationPool;
};

export type VerificationOutcome =
  | { status: 'consumed'; payload: ApiParticulierJobData; jobId: string }
  | { status: 'already_consumed'; jobId: string; consumedAt: Date }
  | { status: 'expired' }
  | { status: 'unknown' }
  | { status: 'error' };

const CONSUME_SQL = `
  UPDATE email_verifications
     SET consumed_at = now()
   WHERE token_hash = $1
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING payload, job_id
`;

// Only reached when the UPDATE matched nothing, to tell the three failure modes apart.
const INSPECT_SQL = `
  SELECT job_id, consumed_at, expires_at
    FROM email_verifications
   WHERE token_hash = $1
`;

export const consumeVerificationToken = async (token: string): Promise<VerificationOutcome> => {
  if (!token) {
    return { status: 'unknown' };
  }

  const tokenHash = hashToken(token);

  try {
    const pool = getPool();

    const consumed = await pool.query<{ payload: ApiParticulierJobData; job_id: string }>(
      CONSUME_SQL,
      [tokenHash],
    );

    if (consumed.rows.length > 0) {
      return {
        status: 'consumed',
        payload: consumed.rows[0].payload,
        jobId: consumed.rows[0].job_id,
      };
    }

    const inspected = await pool.query<{
      job_id: string;
      consumed_at: Date | null;
      expires_at: Date;
    }>(INSPECT_SQL, [tokenHash]);

    if (inspected.rows.length === 0) {
      return { status: 'unknown' };
    }

    const row = inspected.rows[0];

    if (row.consumed_at) {
      return { status: 'already_consumed', jobId: row.job_id, consumedAt: row.consumed_at };
    }

    return { status: 'expired' };
  } catch (e) {
    console.error(`[pass-sport] verification token consumption failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('component', 'email-verification');
      scope.setTag('app', 'site');
      scope.captureMessage('Verification token could not be consumed — no job will be created');
      scope.captureException(e);
    });

    return { status: 'error' };
  }
};
