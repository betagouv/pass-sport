// Link Mobility "Diffusion standard GOUV" transactional email client.
// POST /api/envoyer/e-mail, form-encoded (UTF-8), authed by the `key` param.
// JSON responses: {resultat: 1, id} on success, {resultat: 0, erreurs: "18,20"}
// (comma-separated error codes) on rejection. LINK_MOBILITY_API_URL overrides the
// base URL (mock/real swap point).

const DEFAULT_BASE_URL = "https://diffusion.linkmobility.fr";
const EMAIL_PATH = "/api/envoyer/e-mail";

export interface TransactionalEmailParams {
  subject: string;
  html?: string;
  templateId?: number;
  recipients: string[];
  variables?: Record<string, Record<string, string | number>>;
  senderEmail?: string;
  senderName?: string;
  replyTo?: string;
  name?: string;
  alternativeText?: string;
}

export type SendEmailResult =
  | { sent: true; campaignId: number }
  | { sent: false; errorCodes: string[]; errorMessages: string[] };

const LINK_MOBILITY_ERROR_MESSAGES: Record<string, string> = {
  "2": "Le message est vide",
  "4": "Aucun destinataire valide n'est renseigné",
  "11": "L'envoi des messages est désactivé pour la démonstration",
  "17": "L'expéditeur n'est pas autorisé",
  "18": "Le sujet est trop court",
  "20": "Le nom d'expéditeur est trop court",
  "30": "Clé API non reconnue",
  "63": "Vous avez dépassé votre limite de requêtes api",
};

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
  if ((params.html === undefined) === (params.templateId === undefined)) {
    throw new Error("Error: provide exactly one of html or templateId");
  }

  const body = new URLSearchParams({
    key: requireEnv("LINK_MOBILITY_API_KEY"),
    sujet: params.subject,
    message: params.html ?? String(params.templateId),
    expediteur: params.senderEmail ?? requireEnv("LINK_MOBILITY_SENDER_EMAIL"),
    nom_expediteur: params.senderName ?? requireEnv("LINK_MOBILITY_SENDER_NAME"),
    erreur_texte: "1",
  });

  if (params.templateId !== undefined) body.set("type_message", "creation");

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
  if (params.alternativeText) body.set("alternatif", params.alternativeText);

  return body;
};

interface LinkMobilityRawResponse {
  resultat: number;
  id?: number;
  erreurs?: string | number;
  erreur_texte?: string;
}

const parseSendEmailResponse = (raw: LinkMobilityRawResponse): SendEmailResult => {
  if (raw.resultat === 1 && raw.id !== undefined) {
    return { sent: true, campaignId: raw.id };
  }
  const errorCodes = String(raw.erreurs ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return {
    sent: false,
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
    throw new Error(
      `Request to Link Mobility on ${EMAIL_PATH} has failed. Response status is ${response.status}.`,
    );
  }

  const result = parseSendEmailResponse((await response.json()) as LinkMobilityRawResponse);

  if (!result.sent) {
    console.warn(
      `[pass-sport-worker] Link Mobility rejected email: ${result.errorMessages.join("; ")}`,
    );
  }

  return result;
};
