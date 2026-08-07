import { randomBytes, createHash } from "node:crypto";
import type { Job } from "bullmq";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { sendVerificationEmail } from "../email/notify";
import type { ApiParticulierJobPayload } from "../eligibility/types";
import { emailVerifications } from "../db/schema";
import { logPii } from "../log";
import { startJob, type Database } from "./shared";

export type EmailVerificationJobData = ApiParticulierJobPayload;

export type EmailVerificationDeps = { db: Database };

const TOKEN_TTL_MS = 24 * 3600 * 1000;
const COOLDOWN_MS = 15 * 60 * 1000;

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const mintToken = (): { token: string; tokenHash: string } => {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
};

const verificationLink = (token: string): string => {
  const base = process.env.PUBLIC_SITE_URL;

  if (!base) throw new Error("Error: PUBLIC_SITE_URL is not set");

  const url = new URL("/v2/verification-email", base);

  url.searchParams.set("token", token);

  return url.toString();
};

export async function processEmailVerificationJob(
  job: Job<EmailVerificationJobData>,
  data: EmailVerificationJobData,
  deps: EmailVerificationDeps,
): Promise<{ sent: boolean; throttled: boolean; processedAt: string }> {
  const { db: database } = deps;

  const jobId = job.id ?? null;
  const history = await startJob(job, database, null, data);

  if (jobId && job.attemptsMade === 0) {
    const [recent] = await database
      .select({ id: emailVerifications.id })
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.jobId, jobId),
          isNull(emailVerifications.consumedAt),
          gt(emailVerifications.createdAt, new Date(Date.now() - COOLDOWN_MS)),
        ),
      )
      .limit(1);

    if (recent) {
      console.log(`[pass-sport-worker] job ${job.id}: verification email throttled`);
      await history.record({
        actor: "worker",
        action: "email.verification.throttled",
        status: "skipped",
        payload: { cooldown_ms: COOLDOWN_MS },
      });
      return { sent: false, throttled: true, processedAt: new Date().toISOString() };
    }
  }

  const { token, tokenHash } = mintToken();
  const link = verificationLink(token);

  await database.insert(emailVerifications).values({
    tokenHash,
    payload: data,
    jobId: jobId ?? "",
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  logPii(`job ${job.id}: verification link for ${data.email} -> ${link}`);

  let sent = false;
  try {
    const result = await sendVerificationEmail(data.email, link);
    sent = !!result?.sent;
  } catch (e) {
    await history.record({
      actor: "worker",
      action: "email.verification.sent",
      status: "error",
      error: (e as Error).message,
      // NEVER the raw token: eligibility_history is never purged.
      payload: { token_hash: tokenHash },
    });
    throw e;
  }

  await history.record({
    actor: "worker",
    action: "email.verification.sent",
    status: sent ? "success" : "error",
    error: sent ? undefined : "sender reported not sent",
    payload: { token_hash: tokenHash, expires_in_ms: TOKEN_TTL_MS },
  });

  if (!sent) {
    throw new Error("verification email was rejected by the sender");
  }

  console.log(`[pass-sport-worker] job ${job.id}: verification email sent`);

  return { sent, throttled: false, processedAt: new Date().toISOString() };
}

export const VERIFICATION_RETENTION_MS = 7 * 24 * 3600 * 1000;

export async function sweepEmailVerifications(database: Database): Promise<number> {
  const deleted = await database
    .delete(emailVerifications)
    .where(lt(emailVerifications.expiresAt, new Date(Date.now() - VERIFICATION_RETENTION_MS)))
    .returning({ id: emailVerifications.id });

  return deleted.length;
}

export { TOKEN_TTL_MS, COOLDOWN_MS, hashToken };
