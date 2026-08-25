import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import type { HistoryRecorder } from "../db/history";
import { eligibilityResults } from "../db/schema";
import { logPii } from "../log";
import { type SendEmailResult, sendTransactionalEmail } from "./link-mobility";

// Every outcome email the worker can send, for both paths. The copy lives in the Link
// Mobility templates; this file picks which one, with which merge fields.

export type EmailKind = "code" | "eligible_soon" | "not_eligible" | "not_eligible_hors_fc";

export type FranceConnectEmailKind = Extract<EmailKind, "code" | "eligible_soon" | "not_eligible">;
export type LcaEmailKind = Extract<EmailKind, "code" | "not_eligible_hors_fc">;

type EmailTemplate = {
  // Overridden per environment by templateEnv; unset, which is the normal case, this is
  // what goes out.
  templateId: number;
  templateEnv: string;
  // Link Mobility indexes `nom` as searchable metadata: constant, never a code or a name.
  campaign: string;
  // `sujet` is posted by us even in template mode (error 18, "le sujet est trop court"). It
  // names the beneficiary because a parent gets one mail per child, and identical subjects
  // collapse into a thread that reads as a duplicate.
  subject: (vars?: BeneficiaryVariables) => string;
  historyAction: string;
};

export const EMAIL_TEMPLATES: Record<EmailKind, EmailTemplate> = {
  code: {
    templateId: 1187050,
    templateEnv: "LINK_MOBILITY_TEMPLATE_CODE",
    campaign: "pass-sport-code",
    subject: (vars) =>
      vars?.prenom ? `Le code pass Sport de ${vars.prenom}` : "Votre code pass Sport",
    historyAction: "email.code",
  },
  eligible_soon: {
    templateId: 1187053,
    templateEnv: "LINK_MOBILITY_TEMPLATE_ELIGIBLE_SOON",
    campaign: "pass-sport-eligible-soon",
    subject: (vars) =>
      vars?.prenom ? `${vars.prenom} est éligible au pass Sport` : "Votre demande pass Sport",
    historyAction: "email.eligible_soon",
  },
  not_eligible: {
    templateId: 1187056,
    templateEnv: "LINK_MOBILITY_TEMPLATE_NOT_ELIGIBLE",
    campaign: "pass-sport-not-eligible",
    subject: (vars) =>
      vars?.beneficiaire
        ? `Votre demande pass Sport pour ${vars.beneficiaire}`
        : "Votre demande pass Sport",
    historyAction: "email.not_eligible",
  },
  not_eligible_hors_fc: {
    templateId: 1187059,
    templateEnv: "LINK_MOBILITY_TEMPLATE_NOT_ELIGIBLE_HORS_FC",
    campaign: "pass-sport-not-eligible-hors-fc",
    subject: () => "Votre demande pass Sport",
    historyAction: "email.not_eligible_hors_fc",
  },
};

const templateIdFor = (kind: EmailKind): number => {
  const { templateId, templateEnv } = EMAIL_TEMPLATES[kind];
  const raw = process.env[templateEnv];
  if (!raw?.trim()) return templateId;

  // `> 0` rejects NaN and 0 alike: `message=0` is answered with error 2, "le message est vide".
  const override = Number(raw);
  if (override > 0) return override;

  // A typo in an override must not cost the mails.
  console.warn(
    `[pass-sport-worker] ${templateEnv}="${raw}" is not a template id, using ${templateId}`,
  );
  return templateId;
};

// ─── Parcours FranceConnect ──────────────────────────────────────────────────

// FranceConnect vouches for the mailbox, so these mails may name the beneficiary. Nothing
// was typed by the usager here, so there is no mismatch case.
export const franceConnectEmailKind = (
  hasCode: boolean,
  isEligible: boolean,
): FranceConnectEmailKind => (hasCode ? "code" : isEligible ? "eligible_soon" : "not_eligible");

// These run against an LCA whose courriel is a mailbox we control, while their FranceConnect
// identities are test ones nobody reads — so the priority is reversed there.
const LCA_FIRST_ENVS = ["local", "staging"];

// Two addresses for the same allocataire: the one LCA holds, from the CAF/MSA file, and the
// one FranceConnect just served. In production the FranceConnect one wins, being the address
// the usager authenticated with minutes ago rather than whatever the caisse recorded years ago.
export const franceConnectRecipient = (
  lcaEmail: string | undefined,
  franceConnectEmail: string | undefined,
): string | undefined =>
  LCA_FIRST_ENVS.includes(process.env.ENV ?? "")
    ? (lcaEmail ?? franceConnectEmail)
    : (franceConnectEmail ?? lcaEmail);

// ─── Parcours hors FranceConnect ─────────────────────────────────────────────

// 'not_found' and "found, but the typed address is not the one LCA holds" MUST produce a
// byte-identical send. Whoever filled the form chose that address, so two distinguishable
// mails would tell them whether the person they named is a beneficiary — the enumeration
// oracle the site closes by answering `outcome: 'sent'` in both cases.
export const lcaEmailKind = (
  lcaStatus: "confirmed" | "not_found",
  emailsMatch: boolean,
): LcaEmailKind => (lcaStatus === "confirmed" && emailsMatch ? "code" : "not_eligible_hors_fc");

// ─────────────────────────────────────────────────────────────────────────────

type BeneficiaryVariables = {
  // Rendered here rather than in the template: the allocataire is optional on both paths, and
  // a template doing "Bonjour {prenom_allocataire}," would render "Bonjour ,".
  salutation: string;
  prenom: string;
  nom: string;
  beneficiaire: string;
};

export type EmailVariables =
  | ({ kind: "code"; code: string } & BeneficiaryVariables)
  | ({ kind: "eligible_soon" | "not_eligible" } & BeneficiaryVariables)
  // No merge field at all, so no later spread can put a name back into the mail that goes
  // to an address nobody verified.
  | { kind: "not_eligible_hors_fc" };

// `family_name` is the nom de naissance, `preferred_username` the nom d'usage.
export type AllocataireIdentity = {
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
};

const fullName = (firstname?: string, lastname?: string): string =>
  [firstname, lastname].filter(Boolean).join(" ").trim();

export const beneficiaryVariables = (
  beneficiary: { firstname: string; lastname: string },
  allocataire: AllocataireIdentity,
): BeneficiaryVariables => {
  const allocataireName = fullName(
    allocataire.given_name,
    allocataire.preferred_username || allocataire.family_name,
  );
  return {
    salutation: allocataireName ? `Bonjour ${allocataireName},` : "Bonjour,",
    prenom: beneficiary.firstname,
    nom: beneficiary.lastname,
    beneficiaire: fullName(beneficiary.firstname, beneficiary.lastname),
  };
};

export function sendOutcomeEmail(
  recipient: string,
  vars: EmailVariables,
): Promise<SendEmailResult> {
  const template = EMAIL_TEMPLATES[vars.kind];
  const templateId = templateIdFor(vars.kind);

  if (vars.kind === "not_eligible_hors_fc") {
    return sendTransactionalEmail({
      subject: template.subject(),
      name: template.campaign,
      templateId,
      recipients: [recipient],
    });
  }

  const { kind: _kind, ...merge } = vars;

  return sendTransactionalEmail({
    subject: template.subject(merge),
    name: template.campaign,
    templateId,
    recipients: [recipient],
    variables: { [recipient]: merge },
  });
}

// A failure here is recorded and swallowed: the verdicts are already persisted, and failing
// the job would re-run every external call just to re-send one email.
export async function recordEmailDelivery(params: {
  job: Job<unknown>;
  database: Database;
  history: HistoryRecorder;
  resultId: string;
  kind: EmailKind;
  subject: "self" | "enfant";
  recipient: string;
  bodyPayload: Record<string, unknown>;
  send: () => Promise<SendEmailResult>;
}): Promise<boolean> {
  const { job, database, history, resultId, kind, subject, recipient, bodyPayload, send } = params;
  const action = EMAIL_TEMPLATES[kind].historyAction;

  try {
    const result = await send();

    if (!result.sent) {
      console.warn(
        `[pass-sport-worker] job ${job.id}: ${kind} email NOT sent: ${result.errorMessages.join("; ")}`,
      );
      // Nothing re-sends, so a rate limit is a silent loss and has to be told apart from a
      // payload Link Mobility would reject every time.
      if (result.errorCodes.includes("63")) {
        Sentry.captureMessage("Link Mobility rate limit reached", {
          level: "warning",
          tags: { component: "email" },
        });
      }
      await history.record({
        actor: "worker",
        action,
        status: "error",
        subject,
        error: result.errorMessages.join("; "),
        bodyPayload,
        responsePayload: result,
      });
      return false;
    }

    // updated_at is maintained by a BEFORE UPDATE trigger, never by the writer.
    await database
      .update(eligibilityResults)
      .set({ emailSent: true })
      .where(eq(eligibilityResults.id, resultId));

    console.log(`[pass-sport-worker] job ${job.id}: sent ${kind} email`);
    logPii(`job ${job.id}: sent ${kind} email to ${recipient}`);

    await history.record({
      actor: "worker",
      action,
      status: "success",
      subject,
      bodyPayload,
      responsePayload: result,
    });

    return true;
  } catch (e) {
    console.warn(
      `[pass-sport-worker] job ${job.id}: ${kind} email send threw: ${(e as Error).message}`,
    );
    Sentry.captureException(e, {
      tags: { component: "email", emailKind: kind },
      extra: { jobId: job.id },
    });
    await history.record({
      actor: "worker",
      action,
      status: "error",
      subject,
      error: (e as Error).message,
      bodyPayload,
    });
    return false;
  }
}
