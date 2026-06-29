// RGPD retention: delete audit rows older than AUDIT_RETENTION_DAYS.
// Run on a schedule (Scalingo Scheduler) e.g. daily. The audit table holds no
// personal identifiers, but client_ip is still personal data, so it must not be kept
// indefinitely. Retention length is a DPO/finalité decision.

import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? process.env.SCALINGO_POSTGRESQL_URL;
if (!url) {
  console.error('DATABASE_URL (or SCALINGO_POSTGRESQL_URL) is missing');
  process.exit(1);
}

const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? 365);
const ssl = process.env.PGSSL_DISABLE === 'true' ? false : 'require';
const sql = postgres(url, { ssl });

try {
  const deleted = await sql`
    DELETE FROM audit_api_particulier
    WHERE created_at < now() - (${retentionDays} * interval '1 day')
  `;
  console.log(`Purged ${deleted.count} audit rows older than ${retentionDays} days`);
} catch (e) {
  console.error('Audit purge failed:', e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
