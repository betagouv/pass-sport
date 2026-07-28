import { Pool } from 'pg';
import * as Sentry from '@sentry/nextjs';

export type ExistingApplication = {
  // When this pseudonym first applied in the window.
  firstApplication: Date;
  // Most recent row, which is what "your request was processed on …" should show.
  lastApplication: Date;
};

// Mirror of the worker's Verdict (worker/src/index.ts). 'not_assessed' means the person
// was never asked about, and is filtered out before display.
export type Verdict = 'eligible_confirmed' | 'eligible_pending' | 'not_eligible' | 'not_assessed';

export type BeneficiaryResult = {
  source: 'self' | 'enfant';
  // Null on 'self' rows: the allocataire is named by the session, not by the view.
  givenName: string | null;
  verdict: Verdict;
  // Null outside 'eligible_confirmed', and on rows written before the code was stored at
  // all — those users only ever got it by email.
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
  // Rolling year — what PROCESSED_MARKER_TTL_SECONDS defaulted to.
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
      // Read-only and rare: a couple of connections is plenty.
      max: 4,
      ssl: process.env.PGSSL_DISABLE === 'true' ? undefined : { rejectUnauthorized: false },
    });
    pool.on('connect', () => {
      console.log('[pass-sport] applications database connection successful');
    });
    // Fires on idle-client failures too, not only on connect.
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
      'select first_application, last_application from applications_by_sub where sub = $1 and last_application >= $2',
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
    // Returning null keeps the page rendering, but it is indistinguishable from "never
    // applied" — and since removeOnComplete drops the BullMQ record at completion, this
    // is the ONLY thing standing between a returning user and being shown the form
    // again. A failure here must be loud.
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

// Per-beneficiary verdicts of this pseudonym's LAST run — the view already restricts to
// it. An empty array is genuinely ambiguous: the job may still be queued, or it may have
// failed for good (the worker's PHASE 2 is all-or-nothing, so a dead job writes nothing).
// Callers treat both as "pending" and give up on a timer rather than waiting forever.
export const findResultsForSub = async (sub: string): Promise<BeneficiaryResult[]> => {
  try {
    const { rows } = await getPool().query<{
      source: BeneficiaryResult['source'];
      given_name: string | null;
      verdict: Verdict;
      pass_sport_code: string | null;
    }>(
      'select source, given_name, verdict, pass_sport_code from application_results_by_sub where sub = $1 order by source, given_name',
      [sub],
    );
    return rows.map((r) => ({
      source: r.source,
      givenName: r.given_name,
      verdict: r.verdict,
      code: r.pass_sport_code,
    }));
  } catch (e) {
    // Unlike the dedup lookup above this one is not load-bearing — the recap simply never
    // resolves and the user falls back to the email. Still worth a Sentry event: a missing
    // GRANT on the view fails exactly here and nowhere else.
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
