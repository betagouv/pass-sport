import type { Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { isChildAide, type LcaJobData } from "../eligibility/types";
import { eligibilityResults, type Verdict } from "../db/schema";
import { logPii } from "../log";
import { sendJobDigest, startJob, type Database, type EmailKind } from "./shared";

export type LcaDeps = { db: Database };

// No API Particulier on this path: LCA either holds the beneficiary or it does not, and the
// site already told the usager which. 'not_assessed' covers the gateway being down — nothing
// was concluded about this person, so nothing is claimed.
const VERDICT_BY_STATUS: Record<LcaJobData["lcaStatus"], Verdict> = {
  confirmed: "eligible_confirmed",
  not_found: "not_eligible",
  error: "not_assessed",
};

/**
 * Everything the synchronous verdict could not do inside the usager's request: journal the
 * LCA calls, persist the result, and mail the code to the address LCA holds for the
 * allocataire. Failing here never costs anyone their code — they already have it on screen.
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
      payload: event.payload,
    });
  }

  const verdict = VERDICT_BY_STATUS[data.lcaStatus];
  const emailKind: EmailKind | null = data.lcaStatus === "confirmed" ? "code" : null;

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
        payload: { reason: "an identical verdict was already recorded and mailed" },
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
    email: data.email,
  });

  await history.record({
    actor: "worker",
    action: "results.persisted",
    status: "success",
    payload: { rows: 1, verdict, lca_status: data.lcaStatus },
  });

  logPii(`job ${job.id}: ${data.aide} -> LCA ${data.lcaStatus}, recipient ${data.email ?? "none"}`);

  // Only a confirmed beneficiary is mailed: the address comes from the LCA answer, so on
  // every other outcome there is nobody to write to.
  const emailed = emailKind
    ? await sendJobDigest({
        job,
        database,
        history,
        recipient: data.email ?? undefined,
        entries: [
          {
            firstname: data.beneficiary.firstname,
            lastname: data.beneficiary.lastname,
            kind: emailKind,
            code: data.passSportCode ?? undefined,
          },
        ],
        allocataire: data.allocataire,
      })
    : false;

  console.log(`[pass-sport-worker] job ${job.id}: verdict=${verdict}, emailed=${emailed}`);

  return { verdict, emailed, skipped: false, processedAt: new Date().toISOString() };
}
