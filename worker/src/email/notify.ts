import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import type { HistoryRecorder } from "../db/history";
import { eligibilityResults } from "../db/schema";
import {
  isChildAide,
  SITUATION,
  type ResultSituation,
  type Situation,
} from "../eligibility/types";
import { logPii } from "../log";
import {
  isTerminalEmailError,
  LinkMobilityHttpError,
  type SendEmailResult,
  sendTransactionalEmail,
} from "./link-mobility";

// One template per situation, because the three mails do not say the same thing: an allocataire
// holding their own code, a boursier, and a parent reading a code minted for their child.
export type CodeEmailKind = "code_direct_aah" | "code_direct_boursier" | "code_indirect";

// What a mail about a beneficiary can be. Retired words still sit in eligibility_results.email_kind
// on older rows ('code', 'eligible_soon', 'not_eligible', 'code_withheld') — the schema comment on
// that column is what documents them, since nothing here can send them any more.
export type OutcomeEmailKind = CodeEmailKind | "not_eligible_hors_fc";
export type EmailKind = OutcomeEmailKind | "acknowledgment";

// Uppercase because these ARE the Link Mobility merge field names — a template expecting
// BENEFICIAIRE_PRENOM renders the raw token when the key is missing from the send.
type CodeVariables = {
  BENEFICIAIRE_PRENOM: string;
  BENEFICIAIRE_NOM: string;
  DATE_NAISSANCE_BENEFICIAIRE: string;
  CODE: string;
};

// Only the indirect template names the allocataire: they are the reader, not the beneficiary.
type IndirectCodeVariables = CodeVariables & {
  ALLOCATAIRE_PRENOM: string;
  ALLOCATAIRE_NOM: string;
};

type EmailTemplate = {
  templateId: number;
  templateEnv: string;
  campaign: string;
  subject: (vars?: CodeVariables) => string;
  historyAction: string;
};

export const EMAIL_TEMPLATES: Record<EmailKind, EmailTemplate> = {
  code_direct_aah: {
    templateId: 1192621,
    templateEnv: "LINK_MOBILITY_TEMPLATE_CODE_DIRECT_AAH",
    campaign: "pass-sport-code-direct-aah",
    subject: () => "Votre code pass Sport",
    historyAction: "email.code_direct_aah",
  },
  code_direct_boursier: {
    templateId: 1192620,
    templateEnv: "LINK_MOBILITY_TEMPLATE_CODE_DIRECT_BOURSIER",
    campaign: "pass-sport-code-direct-boursier",
    subject: () => "Votre code pass Sport",
    historyAction: "email.code_direct_boursier",
  },
  code_indirect: {
    templateId: 1192617,
    templateEnv: "LINK_MOBILITY_TEMPLATE_CODE_INDIRECT",
    campaign: "pass-sport-code-indirect",
    subject: (vars) =>
      vars?.BENEFICIAIRE_PRENOM
        ? `Le code pass Sport de ${vars.BENEFICIAIRE_PRENOM}`
        : "Votre code pass Sport",
    historyAction: "email.code_indirect",
  },
  not_eligible_hors_fc: {
    templateId: 1192478,
    templateEnv: "LINK_MOBILITY_TEMPLATE_NOT_ELIGIBLE_HORS_FC",
    campaign: "pass-sport-not-eligible-hors-fc",
    subject: () => "Votre demande pass Sport",
    historyAction: "email.not_eligible_hors_fc",
  },
  acknowledgment: {
    templateId: 1192462,
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

// The aide alone decides which of the three code templates goes out. Shared by both paths: the
// parcours hors FranceConnect reads it off the job payload, the FranceConnect one off the
// situation column its insert now fills.
export const codeEmailKindForAide = (aide: Situation | ResultSituation): CodeEmailKind => {
  if (isChildAide(aide)) return "code_indirect";

  // CROUS, FSS and the stored 'boursier' are three names for one bourse — same LCA situation,
  // same step-two form — so everything that is not AAH lands on the same template here.
  return aide === SITUATION.AAH ? "code_direct_aah" : "code_direct_boursier";
};

// ─── Parcours hors FranceConnect ─────────────────────────────────────────────

export const lcaEmailKind = (
  lcaStatus: "confirmed" | "not_found",
  emailsMatch: boolean,
  aide: Situation,
): OutcomeEmailKind =>
  lcaStatus === "confirmed" && emailsMatch ? codeEmailKindForAide(aide) : "not_eligible_hors_fc";

// ─────────────────────────────────────────────────────────────────────────────

export type EmailVariables =
  | ({ kind: "code_direct_aah" | "code_direct_boursier" } & CodeVariables)
  | ({ kind: "code_indirect" } & IndirectCodeVariables)
  // No merge field at all, so no later spread can put a name back into the mail that goes
  // to an address nobody verified.
  | { kind: "not_eligible_hors_fc" };

// `family_name` is the nom de naissance. The nom d'usage is collected on the FranceConnect path
// but deliberately left out here: no mail ever names anyone by it.
export type AllocataireIdentity = {
  given_name?: string;
  family_name?: string;
};

// Both mirror data/utils/emailing_utils.py, so the transactional mail and the campaign CSV
// render the same person the same way.

// pandas str.capitalize(): first letter up, the REST DOWN. "DUPOND" -> "Dupond".
const capitalize = (name?: string): string => {
  const trimmed = name?.trim() ?? "";
  return trimmed ? trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase() : "";
};

// ISO "AAAA-MM-JJ" (the step-one <input type="date">) -> "JJ/MM/AAAA". Anything else is passed
// through: a date we cannot read is better shown raw than silently emptied.
const toFrenchDate = (birthdate: string): string => {
  const iso = birthdate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : birthdate;
};

export const codeEmailVariables = (
  kind: CodeEmailKind,
  beneficiary: { firstname: string; lastname: string; birthdate: string },
  allocataire: AllocataireIdentity,
  code: string,
): EmailVariables => {
  const common: CodeVariables = {
    BENEFICIAIRE_PRENOM: capitalize(beneficiary.firstname),
    BENEFICIAIRE_NOM: capitalize(beneficiary.lastname),
    DATE_NAISSANCE_BENEFICIAIRE: toFrenchDate(beneficiary.birthdate),
    CODE: code,
  };

  if (kind !== "code_indirect") return { kind, ...common };

  // Empty strings rather than absent keys: the step-two form makes the allocataire's name
  // optional, and a missing merge field leaves its token in the body of the mail.
  return {
    kind,
    ...common,
    ALLOCATAIRE_PRENOM: capitalize(allocataire.given_name),
    ALLOCATAIRE_NOM: capitalize(allocataire.family_name),
  };
};

// Nothing is known about any beneficiary this early, so the accusé de réception can only
// speak of the allocataire who just authenticated.
type AcknowledgmentVariables = { prenom: string; nom: string };

const acknowledgmentVariables = (identity: AllocataireIdentity): AcknowledgmentVariables => ({
  prenom: identity.given_name ?? "",
  nom: identity.family_name ?? "",
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
  sendAt?: Date,
): Promise<SendEmailResult> {
  const template = EMAIL_TEMPLATES[vars.kind];
  const templateId = templateIdFor(vars.kind);

  if (vars.kind === "not_eligible_hors_fc") {
    return sendTransactionalEmail({
      subject: template.subject(),
      name: template.campaign,
      templateId,
      recipients: [recipient],
      sendAt,
    });
  }

  const { kind: _kind, ...merge } = vars;

  return sendTransactionalEmail({
    subject: template.subject(merge),
    name: template.campaign,
    templateId,
    recipients: [recipient],
    variables: { [recipient]: merge },
    sendAt,
  });
}

/**
 * What the caller learns about a send. `terminal` is what tells a retrying caller to stop: Link
 * Mobility named a rejection bound to the request itself, so the same request will be rejected
 * again. Everything else — a rate limit, an HTTP error, a throw — leaves it false and stays
 * replayable.
 */
export type EmailDeliveryOutcome = { sent: boolean; terminal: boolean };

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
}): Promise<EmailDeliveryOutcome> {
  const { job, database, history, resultId, kind, subject, recipient, bodyPayload, send } = params;
  const action = EMAIL_TEMPLATES[kind].historyAction;

  // The accusé de réception is job-level and never carries a resultId, so email_kind — which only
  // ever names an OutcomeEmailKind — has nothing to receive on that one.
  const outcomeKind = kind === "acknowledgment" ? null : kind;

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
      return { sent: false, terminal: isTerminalEmailError(result.errorCodes) };
    }

    // updated_at is maintained by a BEFORE UPDATE trigger, never by the writer.
    if (resultId) {
      await database
        .update(eligibilityResults)
        .set(
          outcomeKind
            ? { emailSent: true, emailSentAt: new Date(), emailKind: outcomeKind }
            : { emailSent: true, emailSentAt: new Date() },
        )
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

    return { sent: true, terminal: false };
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
    // Not terminal: a throw is a transport failure or an HTTP status, and neither says the request
    // itself was refused. A resend is the right answer to both.
    return { sent: false, terminal: false };
  }
}
