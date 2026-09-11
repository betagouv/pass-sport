// Link Mobility "Diffusion standard GOUV" transactional email client.
// POST /api/envoyer/e-mail, form-encoded (UTF-8), authed by the `key` param.
// JSON responses: {resultat: 1, id} on success, {resultat: 0, erreurs: "18,20"}
// (comma-separated error codes) on rejection. LINK_MOBILITY_API_URL overrides the
// base URL (mock/real swap point).

const DEFAULT_BASE_URL = "https://diffusion.linkmobility.fr";
const EMAIL_PATH = "/api/envoyer/e-mail";

// Link Mobility authorises senders by domain, and info.pass.sports.gouv.fr is the verified
// one. Both are overridable per environment, so a change needs a restart, not a deploy.
const DEFAULT_SENDER_EMAIL = "ne-pas-repondre@info.pass.sports.gouv.fr";
const DEFAULT_SENDER_NAME = "pass Sport — ministère des Sports";

export interface TransactionalEmailParams {
  subject: string;
  templateId: number;
  recipients: string[];
  variables?: Record<string, Record<string, string | number>>;
  replyTo?: string;
  name?: string;
  // Sent as `date`. A scheduled campaign answers {resultat: 1, id} on acceptance, not on diffusion.
  sendAt?: Date;
}

export type SendEmailResult =
  | { sent: true; httpStatus: number; campaignId: number }
  | { sent: false; httpStatus: number; errorCodes: string[]; errorMessages: string[] };

// Carries the status so eligibility_history can record it. A plain Error would leave the
// column null on exactly the failures worth telling apart later: a 502 gateway blip that
// a resend would fix, versus a 401 on a rotated key that no resend ever will.
export class LinkMobilityHttpError extends Error {
  constructor(readonly httpStatus: number) {
    super(
      `Request to Link Mobility on ${EMAIL_PATH} has failed. Response status is ${httpStatus}.`,
    );
    this.name = "LinkMobilityHttpError";
  }
}

const LINK_MOBILITY_ERROR_MESSAGES: Record<string, string> = {
  "2": "Le message est vide",
  "4": "Aucun destinataire valide n'est renseigné",
  "11": "L'envoi des messages est désactivé pour la démonstration",
  "17": "L'expéditeur n'est pas autorisé",
  "18": "Le sujet est trop court",
  "20": "Le nom d'expéditeur est trop court",
  "30": "Clé API non reconnue",
  "50": "Le fuseau horaire spécifié n'est pas valide",
  "51": "La date est déjà passée après calcul du fuseau horaire",
  "63": "Vous avez dépassé votre limite de requêtes api",
};

// Rejections no resend will ever fix: they describe the request we built, not the moment we sent
// it. Retrying one of these three times only delays the moment someone reads the alert.
//
// '63' (rate limit) is deliberately absent — it IS the case a resend fixes. So is an unknown code:
// nothing is known about it, and treating it as terminal would silently drop a mail.
const TERMINAL_ERROR_CODES = new Set(["2", "4", "17", "30"]);

export const isTerminalEmailError = (errorCodes: string[]): boolean =>
  errorCodes.length > 0 && errorCodes.every((code) => TERMINAL_ERROR_CODES.has(code));

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Error: ${name} is not set`);
  return value;
};

const buildEmailUrl = (): URL =>
  new URL(EMAIL_PATH, process.env.LINK_MOBILITY_API_URL || DEFAULT_BASE_URL);

// Plain recipients as a comma-separated list; with `variables`, PHP-array style
// (destinataires[email][champ]=valeur).
const buildEmailRequestBody = (params: TransactionalEmailParams): URLSearchParams => {
  if (params.recipients.length === 0) {
    throw new Error("Error: at least one recipient is required");
  }
  const body = new URLSearchParams({
    key: requireEnv("LINK_MOBILITY_API_KEY"),
    sujet: params.subject,
    message: String(params.templateId),
    expediteur: process.env.LINK_MOBILITY_SENDER_EMAIL || DEFAULT_SENDER_EMAIL,
    nom_expediteur: process.env.LINK_MOBILITY_SENDER_NAME || DEFAULT_SENDER_NAME,
    type_message: "creation",
    erreur_texte: "1",
  });

  // A template with no merge field is legitimate, hence the plain recipient list below.
  if (params.variables) {
    const missing = params.recipients.filter((email) => !params.variables?.[email]);
    if (missing.length > 0) {
      throw new Error(`Error: missing variables for recipient(s): ${missing.join(", ")}`);
    }
    body.set("destinataires_type", "datas");
    for (const email of params.recipients) {
      for (const [field, value] of Object.entries(params.variables[email])) {
        body.append(`destinataires[${email}][${field}]`, String(value));
      }
    }
  } else {
    body.set("destinataires", params.recipients.join(","));
  }

  if (params.replyTo) body.set("email_reponse", params.replyTo);
  if (params.name) body.set("nom", params.name);
  if (params.sendAt) body.set("date", String(Math.floor(params.sendAt.getTime() / 1000)));

  return body;
};

interface LinkMobilityRawResponse {
  resultat: number;
  id?: number;
  erreurs?: string | number;
  erreur_texte?: string;
}

const parseSendEmailResponse = (
  raw: LinkMobilityRawResponse,
  httpStatus: number,
): SendEmailResult => {
  if (raw.resultat === 1 && raw.id !== undefined) {
    return { sent: true, httpStatus, campaignId: raw.id };
  }
  const errorCodes = String(raw.erreurs ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return {
    sent: false,
    httpStatus,
    errorCodes,
    errorMessages: errorCodes.map(
      (code) => LINK_MOBILITY_ERROR_MESSAGES[code] ?? `Erreur Link Mobility inconnue (${code})`,
    ),
  };
};

export const sendTransactionalEmail = async (
  params: TransactionalEmailParams,
): Promise<SendEmailResult> => {
  const body = buildEmailRequestBody(params);

  const response = await fetch(buildEmailUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new LinkMobilityHttpError(response.status);
  }

  const result = parseSendEmailResponse(
    (await response.json()) as LinkMobilityRawResponse,
    response.status,
  );

  if (!result.sent) {
    console.warn(
      `[pass-sport-worker] Link Mobility rejected email: ${result.errorMessages.join("; ")}`,
    );
  }

  return result;
};
