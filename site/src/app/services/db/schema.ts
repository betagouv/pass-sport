import { pgTable, timestamp, text, inet, integer, boolean, uuid, index } from 'drizzle-orm/pg-core';

// Drizzle schema for the API Particulier audit trail.
export const auditApiParticulier = pgTable(
  'audit_api_particulier',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    requestId: uuid('request_id').notNull(),
    franceConnected: boolean('france_connected').notNull(),
    clientIp: inet('client_ip'),
    userAgent: text('user_agent'),
    // e.g. dss.quotient_familial_identite
    resource: text('resource').notNull(),
    httpStatus: integer('http_status'),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    index('idx_audit_ip_created').on(t.clientIp, t.createdAt),
    index('idx_audit_created').on(t.createdAt),
  ],
);

export type AuditRow = typeof auditApiParticulier.$inferInsert;
