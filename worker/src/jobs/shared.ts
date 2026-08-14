import type { Job } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createHistoryRecorder, type HistoryRecorder } from "../db/history";
import * as schema from "../db/schema";
import { audit, eligibilityResults, type Verdict } from "../db/schema";
import { type DigestEntry, type DigestRecipientIdentity, sendBeneficiaryDigestEmail } from "../email/notify";
import { logPii } from "../log";

export type Database = NodePgDatabase<typeof schema>;
export type EmailKind = DigestEntry["kind"];

export async function startJob(
  job: Job<unknown>,
  database: Database,
  allocataireFcSub: string | null,
  client: { clientIp?: string | null; userAgent?: string | null },
): Promise<HistoryRecorder> {
  const history = createHistoryRecorder(database, {
    allocataireFcSub,
    jobId: job.id ?? null,
    attempt: job.attemptsMade,
  });

  if (job.attemptsMade === 0) {
    await database.insert(audit).values({
      jobId: job.id ?? null,
      jobName: job.name ?? null,
      ipAddress: client.clientIp ?? null,
      userAgent: client.userAgent ?? null,
    });
  }

  return history;
}

// A confirmed LCA beneficiary IS eligible whatever our own rules concluded: the LCA base
// is authoritative and the person is walking away with a code.
export const verdictFor = (hasCode: boolean, isEligible: boolean): Verdict =>
  isEligible ? (hasCode ? "eligible_confirmed" : "eligible_pending") : "not_eligible";

export const emailKindFor = (hasCode: boolean, isEligible: boolean): EmailKind =>
  hasCode ? "code" : isEligible ? "eligible_soon" : "not_eligible";

// One recapitulative email per job, then a single UPDATE flipping email_sent on the rows
// it covered. Rows with no emailKind (an LCA error, or a beneficiary nobody claimed an
// aide for) are excluded — nothing was mailed for them.
//
// A failure here is recorded and swallowed: the verdicts are already persisted, and
// failing the job would re-run every external call just to re-send one email.
export async function sendJobDigest(params: {
  job: Job<unknown>;
  database: Database;
  history: HistoryRecorder;
  recipient: string | undefined;
  entries: DigestEntry[];
  allocataire: DigestRecipientIdentity;
}): Promise<boolean> {
  const { job, database, history, recipient, entries, allocataire } = params;

  if (entries.length === 0) return false;

  // The digest carries names and codes; kept whole, like every other payload here.
  const payload = { to: recipient ?? null, beneficiaries: entries.length, entries };

  try {
    const result = await sendBeneficiaryDigestEmail(recipient, entries, allocataire);

    if (!result?.sent) {
      console.warn(
        `[pass-sport-worker] job ${job.id}: recap email NOT sent, recipient=${recipient ? "present" : "missing"}`,
      );
      await history.record({
        actor: "worker",
        action: "email.digest",
        status: "error",
        error: recipient ? "sender reported not sent" : "no recipient",
        payload,
      });
      return false;
    }

    if (job.id) {
      await database
        .update(eligibilityResults)
        .set({ emailSent: true })
        .where(and(eq(eligibilityResults.jobId, job.id), isNotNull(eligibilityResults.emailKind)));
    }

    console.log(
      `[pass-sport-worker] job ${job.id}: sent recap email covering ${entries.length} beneficiaries`,
    );
    logPii(`job ${job.id}: sent recap email to ${recipient ?? "<no recipient>"}`);

    await history.record({
      actor: "worker",
      action: "email.digest",
      status: "success",
      payload,
    });

    return true;
  } catch (e) {
    console.warn(`[pass-sport-worker] job ${job.id}: email send threw: ${(e as Error).message}`);
    await history.record({
      actor: "worker",
      action: "email.digest",
      status: "error",
      error: (e as Error).message,
      payload,
    });
    return false;
  }
}
