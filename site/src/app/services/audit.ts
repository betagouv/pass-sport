// Audit trail for API Particulier access. One row per resource call.
//
// RGPD: stores who-the-service / when / from-which-IP / which resource / outcome — and NOTHING
// that identifies the citizen (no FC subject, no pivot, no returned data values). Distinct-identity
// abuse counting is handled separately and ephemerally in abuse-detection.ts (Redis, TTL'd).
//
// Writes are fire-and-forget relative to the user flow: a DB failure here must NOT break the
// citizen's request, so it is caught and reported to Sentry instead of thrown.

import * as Sentry from '@sentry/nextjs';
import { getDb } from '@/app/services/db';
import { auditApiParticulier } from '@/app/services/db/schema';

// Per-callback context, shared by all of that session's resource calls.
export interface AuditContext {
  requestId: string;
  // true = FranceConnect-verified identity; false = direct/non-FC (harvesting gate applies).
  franceConnected: boolean;
  clientIp: string | null;
  userAgent: string | null;
}

// Per-resource outcome captured around each SDK call.
export interface AuditRecord {
  resource: string;
  httpStatus: number | null;
  success: boolean;
  errorCode?: string | null;
  durationMs: number;
}

export const writeAuditEvent = async (ctx: AuditContext, record: AuditRecord): Promise<void> => {
  try {
    const db = await getDb();
    await db.insert(auditApiParticulier).values({
      requestId: ctx.requestId,
      franceConnected: ctx.franceConnected,
      clientIp: ctx.clientIp,
      userAgent: ctx.userAgent,
      resource: record.resource,
      httpStatus: record.httpStatus,
      success: record.success,
      errorCode: record.errorCode ?? null,
      durationMs: record.durationMs,
    });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('audit', 'api-particulier');
      scope.captureMessage('Audit write failed');
      scope.captureException(e);
    });
  }
};
