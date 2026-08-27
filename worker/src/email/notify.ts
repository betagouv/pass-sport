import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import type { HistoryRecorder } from "../db/history";
import { eligibilityResults } from "../db/schema";
import { logPii } from "../log";
import {
  LinkMobilityHttpError,
  type SendEmailResult,
  sendTransactionalEmail,
} from "./link-mobility";

export type OutcomeEmailKind = "code" | "eligible_soon" | "not_eligible" | "not_eligible_hors_fc";
export type EmailKind = OutcomeEmailKind | "acknowledgment";
export type FranceConnectEmailKind = Extract<
  OutcomeEmailKind,
  "code" | "eligible_soon" | "not_eligible"
>;
export type LcaEmailKind = Extract<OutcomeEmailKind, "code" | "not_eligible_hors_fc">;

type EmailTemplate = {
  templateId: number;
  templateEnv: string;
  campaign: string;
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
  acknowledgment: {
    templateId: 1188167,
    templateEnv: "LINK_MOBILITY_TEMPLATE_ACKNOWLEDGMENT",
    campaign: "pass-sport-acknowledgment",
    subject: () => "Votre demande pass Sport a bien été reçue",
    historyAction: "email.acknowledgment",
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
export const franceConnectEmailKind = (
  hasCode: boolean,
  isEligible: boolean,
): FranceConnectEmailKind => (hasCode ? "code" : isEligible ? "eligible_soon" : "not_eligible");

// These run against an LCA whose courriel is a mailbox we control, while their FranceConnect
// identities are test ones nobody reads — so the priority is reversed there.
const LCA_FIRST_ENVS = ["local", "staging"];

export const franceConnectRecipient = (
  lcaEmail: string | undefined,
  franceConnectEmail: string | undefined,
): string | undefined =>
  LCA_FIRST_ENVS.includes(process.env.ENV ?? "")
    ? (lcaEmail ?? franceConnectEmail)
    : franceConnectEmail;

// ─── Parcours hors FranceConnect ─────────────────────────────────────────────
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

// Nothing is known about any beneficiary this early, so the accusé de réception can only
// speak of the allocataire who just authenticated.
type AcknowledgmentVariables = { prenom: string; nom: string };

const acknowledgmentVariables = (identity: AllocataireIdentity): AcknowledgmentVariables => ({
  prenom: identity.given_name ?? "",
  nom: identity.preferred_username || identity.family_name || "",
});

export function sendAcknowledgmentEmail(
  recipient: string,
  identity: AllocataireIdentity,
): Promise<SendEmailResult> {
  const template = EMAIL_TEMPLATES.acknowledgment;

  return sendTransactionalEmail({
    subject: template.subject(),
    name: template.campaign,
    templateId: templateIdFor("acknowledgment"),
    recipients: [recipient],
    variables: { [recipient]: acknowledgmentVariables(identity) },
  });
}

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
  // Both absent on a job-level mail: it predates the eligibility_results rows and speaks
  // of no beneficiary in particular.
  resultId?: string;
  kind: EmailKind;
  subject?: "self" | "enfant";
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
        httpStatus: result.httpStatus,
        error: result.errorMessages.join("; "),
        bodyPayload,
        responsePayload: result,
      });
      return false;
    }

    // updated_at is maintained by a BEFORE UPDATE trigger, never by the writer.
    if (resultId) {
      await database
        .update(eligibilityResults)
        .set({ emailSent: true })
        .where(eq(eligibilityResults.id, resultId));
    }

    console.log(`[pass-sport-worker] job ${job.id}: sent ${kind} email`);
    logPii(`job ${job.id}: sent ${kind} email to ${recipient}`);

    await history.record({
      actor: "worker",
      action,
      status: "success",
      subject,
      httpStatus: result.httpStatus,
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
      // Null on a network failure, where no response ever came back.
      httpStatus: e instanceof LinkMobilityHttpError ? e.httpStatus : null,
      error: (e as Error).message,
      bodyPayload,
    });
    return false;
  }
}
