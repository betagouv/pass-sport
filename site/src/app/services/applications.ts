import { Pool } from 'pg';
import * as Sentry from '@sentry/nextjs';

export type ExistingApplication = {
  // When this pseudonym first applied in the window.
  firstApplication: Date;
  // Most recent row, which is what "your request was processed on …" should show.
  lastApplication: Date;
};

// Mirror of the worker's Verdict (worker/src/db/schema.ts). 'not_assessed' means the person
// was never asked about, and is filtered out before display. 'eligible_pending_lca' means a
// code has been minted for this person but LCA does not serve it yet — BeneficiaryRecap
// shows the code with its own caveat rather than in the confirmed bucket.
export type Verdict =
  | 'eligible_confirmed'
  | 'eligible_pending'
  | 'eligible_pending_lca'
  | 'not_eligible'
  | 'not_assessed';

export type BeneficiaryResult = {
  source: 'self' | 'enfant';
  // Null on 'self' rows: the allocataire is named by the session, not by the view.
  givenName: string | null;
  verdict: Verdict;
  // Set on 'eligible_confirmed' and on 'eligible_pending_lca' (a minted code LCA does not
  // serve yet). Null elsewhere, and on rows written before the code was stored at all —
  // those users only ever got it by email.
  code: string | null;
};

const campaignStart = (): Date => {
  const configured = process.env.CAMPAIGN_START_DATE;
  if (configured) {
    const parsed = Date.parse(configured);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
    console.warn(`[pass-sport] CAMPAIGN_START_DATE is not a valid date: ${configured}`);
  }

  return new Date(Date.now() - 365 * 24 * 3600 * 1000);
};

const globalForPool = globalThis as unknown as { __applicationsPool?: Pool };

const getPool = (): Pool => {
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

export const findApplicationForSub = async (sub: string): Promise<ExistingApplication | null> => {
  try {
    const { rows } = await getPool().query<{ first_application: Date; last_application: Date }>(
      'SELECT first_application, last_application FROM applications_by_sub WHERE sub = $1 AND last_application >= $2',
      [sub, campaignStart()],
    );
    if (rows.length === 0) {
      return null;
    }
    return {
      firstApplication: rows[0].first_application,
      lastApplication: rows[0].last_application,
    };
  } catch (e) {
    console.error(`[pass-sport] applications lookup failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('lookup', 'applications_by_sub');
      scope.captureMessage('Applications lookup failed — returning users will not be recognised');
      scope.captureException(e);
    });

    return null;
  }
};

export const findApplicationForJobId = async (
  jobId: string,
): Promise<ExistingApplication | null> => {
  try {
    const { rows } = await getPool().query<{ first_application: Date; last_application: Date }>(
      'SELECT first_application, last_application FROM applications_by_job_id WHERE job_id = $1 AND last_application >= $2',
      [jobId, campaignStart()],
    );
    if (rows.length === 0) {
      return null;
    }
    return {
      firstApplication: rows[0].first_application,
      lastApplication: rows[0].last_application,
    };
  } catch (e) {
    console.error(`[pass-sport] applications lookup failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('lookup', 'applications_by_job_id');
      scope.captureMessage('Applications lookup failed — a resubmission will re-run the chain');
      scope.captureException(e);
    });

    return null;
  }
};

export type ProcessedRequest = { emailMask: string | null; emailSent: boolean };

export const findResultForJobId = async (jobId: string): Promise<ProcessedRequest | null> => {
  try {
    const { rows } = await getPool().query<{ email_mask: string | null; email_sent: boolean }>(
      'SELECT email_mask, email_sent FROM application_results_by_job_id WHERE job_id = $1',
      [jobId],
    );
    if (rows.length === 0) {
      return null;
    }
    return { emailMask: rows[0].email_mask, emailSent: rows[0].email_sent };
  } catch (e) {
    console.error(`[pass-sport] results lookup failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('lookup', 'application_results_by_job_id');
      scope.captureMessage('Results lookup failed — the recap will not name the mailbox');
      scope.captureException(e);
    });

    return null;
  }
};

export const findResultsForSub = async (sub: string): Promise<BeneficiaryResult[]> => {
  try {
    const { rows } = await getPool().query<{
      source: BeneficiaryResult['source'];
      given_name: string | null;
      verdict: Verdict;
      pass_sport_code: string | null;
    }>(
      'SELECT source, given_name, verdict, pass_sport_code FROM application_results_by_sub WHERE sub = $1 ORDER BY source, given_name',
      [sub],
    );
    return rows.map((r) => ({
      source: r.source,
      givenName: r.given_name,
      verdict: r.verdict,
      code: r.pass_sport_code,
    }));
  } catch (e) {
    console.error(`[pass-sport] results lookup failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('lookup', 'application_results_by_sub');
      scope.captureMessage('Results lookup failed — the on-site recap will never resolve');
      scope.captureException(e);
    });

    return [];
  }
};
