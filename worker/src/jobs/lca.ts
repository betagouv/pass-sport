import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { isChildAide, type LcaJobData } from "../eligibility/types";
import { eligibilityResults, type Verdict } from "../db/schema";
import { sendLcaOutcomeEmail } from "../email/notify";
import { logPii } from "../log";
import { recordEmailDelivery, startJob, type Database } from "./shared";

export type LcaDeps = { db: Database };

// This path's own email_kind vocabulary. Not DigestEntry["kind"]: that one describes the
// FranceConnect recap, and has no way to say "LCA holds a code but it was not mailed".
type LcaEmailKind = "code" | "code_withheld" | "not_eligible";

const normalizeEmail = (value: string | null | undefined): string | null =>
  value ? value.trim().toLowerCase() : null;

// No API Particulier on this path: LCA either holds the beneficiary or it does not, and the
// site already told the usager which. 'not_assessed' covers the gateway being down — nothing
// was concluded about this person, so nothing is claimed. 'confirmed' is refined below: it
// only stays 'eligible_confirmed' when the code could actually be mailed.
const VERDICT_BY_STATUS: Record<LcaJobData["lcaStatus"], Verdict> = {
  confirmed: "eligible_confirmed",
  not_found: "not_eligible",
  error: "not_assessed",
};

/**
 * Everything the synchronous verdict could not do inside the usager's request: journal the
 * LCA calls, persist the result, and mail the outcome to the address collected at step two.
 * Failing here never costs anyone their code — they already have it on screen.
 */
export async function processLcaJob(
  job: Job<LcaJobData>,
  data: LcaJobData,
  deps: LcaDeps,
): Promise<{ verdict: Verdict; emailed: boolean; skipped: boolean; processedAt: string }> {
  const { db: database } = deps;

  console.log(`[pass-sport-worker] job ${job.id}: lca, aide=${data.aide}, ${data.lcaStatus}`);

  const history = await startJob(job, database, null, data);

  for (const event of data.history) {
    await history.record({
      actor: "lca",
      action: event.action,
      status: event.status,
      subject: isChildAide(data.aide) ? "enfant" : "self",
      durationMs: event.durationMs,
      error: event.error,
      bodyPayload: event.bodyPayload,
      responsePayload: event.responsePayload ?? event.payload,
    });
  }

  // Anyone can type a mailbox into the form. The code is only ever served to the address LCA
  // already holds for this allocataire; when the two differ, LCA still holds the beneficiary
  // but nothing was sent, and the verdict has to say so rather than claim a delivered code.
  const emailsMatch = normalizeEmail(data.contactEmail) === normalizeEmail(data.email);
  const isConfirmed = data.lcaStatus === "confirmed";

  const verdict: Verdict =
    isConfirmed && !emailsMatch
      ? "eligible_confirmed_but_email_not_matching"
      : VERDICT_BY_STATUS[data.lcaStatus];

  // LCA never answered, so nothing was concluded about this person. A row here would be a
  // verdict claiming otherwise; the LCA events replayed above are the whole trace. Leaving
  // the table empty also leaves applications_by_job_id empty, so the usager can come back
  // once the gateway is up instead of being told they already applied.
  if (verdict === "not_assessed") {
    console.log(`[pass-sport-worker] job ${job.id}: LCA unreachable, nothing to record`);
    await history.record({
      actor: "worker",
      action: "results.skipped",
      status: "skipped",
      responsePayload: { rows: 0, reason: "lca_unreachable" },
    });
    return { verdict, emailed: false, skipped: true, processedAt: new Date().toISOString() };
  }

  // Past the early return only 'confirmed' and 'not_found' remain, so an email always goes out.
  const emailKind: LcaEmailKind = isConfirmed
    ? emailsMatch
      ? "code"
      : "code_withheld"
    : "not_eligible";
  const outcome = emailKind === "code" ? "success" : "failure";

  // BullMQ drops a job once it completes, so a usager who submits the same request twice
  // gets a second one through. The row already written is what recognises it.
  if (job.id) {
    const [existing] = await database
      .select({ id: eligibilityResults.id })
      .from(eligibilityResults)
      .where(
        and(
          eq(eligibilityResults.jobId, job.id),
          eq(eligibilityResults.verdict, verdict),
          eq(eligibilityResults.emailSent, true),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(`[pass-sport-worker] job ${job.id}: already recorded and mailed, skipping`);
      await history.record({
        actor: "worker",
        action: "results.skipped",
        status: "skipped",
        responsePayload: { reason: "an identical verdict was already recorded and mailed" },
      });
      return { verdict, emailed: false, skipped: true, processedAt: new Date().toISOString() };
    }
  }

  await database.insert(eligibilityResults).values({
    jobId: job.id ?? null,
    source: isChildAide(data.aide) ? "enfant" : "self",
    allocataireIdentite: data.allocataire,
    allocataireFcSub: null,
    enfantIdentite: isChildAide(data.aide)
      ? {
          family_name: data.beneficiary.lastname,
          given_name: data.beneficiary.firstname,
          birthdate: data.beneficiary.birthdate,
        }
      : null,
    isEligible: data.lcaStatus === "confirmed",
    isFranceConnected: false,
    residenceInsee: data.residenceInsee,
    lcaStatus: data.lcaStatus,
    verdict,
    passSportCode: data.passSportCode,
    emailKind,
    emailSent: false,
    email: data.contactEmail,
  });

  await history.record({
    actor: "worker",
    action: "results.persisted",
    status: "success",
    responsePayload: { rows: 1, verdict, lca_status: data.lcaStatus },
  });

  logPii(
    `job ${job.id}: ${data.aide} -> LCA ${data.lcaStatus}, recipient ${data.contactEmail}, kind ${emailKind}`,
  );

  const emailed = await recordEmailDelivery({
    job,
    database,
    history,
    recipient: data.contactEmail,
    bodyPayload: {
      to: data.contactEmail,
      outcome,
      email_kind: emailKind,
      emails_match: emailsMatch,
    },
    send: () =>
      sendLcaOutcomeEmail(data.contactEmail, {
        outcome,
        beneficiary: data.beneficiary,
        code: outcome === "success" ? (data.passSportCode ?? undefined) : undefined,
      }),
  });

  console.log(`[pass-sport-worker] job ${job.id}: verdict=${verdict}, emailed=${emailed}`);

  return { verdict, emailed, skipped: false, processedAt: new Date().toISOString() };
}
