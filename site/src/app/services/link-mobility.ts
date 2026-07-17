// Link Mobility "Diffusion standard GOUV" client — transactional email only.
//
// API: POST https://diffusion.linkmobility.fr/api/envoyer/e-mail, form-encoded
// (UTF-8), authenticated by the account API key passed as the `key` parameter.
// Responses are JSON: {resultat: 1, id: <campaign id>} on success,
// {resultat: 0, erreurs: "18,20"} on rejection (comma-separated error codes).
//
// Reference: "Diffusion standard GOUV" PDF (Documentation de l'API > Envoyer un Email).
//
// Env:
// - LINK_MOBILITY_API_KEY      (required) account API key
// - LINK_MOBILITY_SENDER_EMAIL (required) default `expediteur` — must be a domain
//   referenced on the Diffusion standard GOUV account
// - LINK_MOBILITY_SENDER_NAME  (required) default `nom_expediteur`
// - LINK_MOBILITY_API_URL      (optional) base URL override, e.g. a local mock
//   server in tests / staging

import * as Sentry from '@sentry/nextjs';

const DEFAULT_BASE_URL = 'https://diffusion.linkmobility.fr';
const EMAIL_PATH = '/api/envoyer/e-mail';
const TEMPLATES_PATH = '/api/medias/lister';

export interface TransactionalEmailParams {
  // Displayed in the recipient inbox.
  subject: string;
  // HTML body. Exactly one of `html` / `templateId` must be provided.
  html?: string;
  // Id of an emailing template already registered on the Link Mobility account
  // (see /api/medias/lister, output=1). Sent as type_message=creation with the
  // id in the `message` field.
  templateId?: number;
  recipients: string[];
  // Per-recipient template variables, keyed by recipient email. Substituted in
  // the content via {placeholders} (e.g. "Bonjour {prenom}"). When provided, an
  // entry is required for every recipient (destinataires_type=datas encodes the
  // recipients themselves).
  variables?: Record<string, Record<string, string | number>>;
  // Overrides of the env-configured sender.
  senderEmail?: string;
  senderName?: string;
  // Optional reply-to redirection.
  replyTo?: string;
  // Internal campaign label, never shown to recipients.
  name?: string;
  // Plain-text alternative, improves deliverability.
  alternativeText?: string;
}

export type SendEmailResult =
  | { sent: true; campaignId: number }
  | { sent: false; errorCodes: string[]; errorMessages: string[] };

// Email-relevant subset of the API "Tableau des erreurs".
export const LINK_MOBILITY_ERROR_MESSAGES: Record<string, string> = {
  '2': 'Le message est vide',
  '4': "Aucun destinataire valide n'est renseigné",
  '7': "Votre compte n'a pas de formule définie",
  '9': 'Le système a rencontré une erreur',
  '11': "L'envoi des messages est désactivé pour la démonstration",
  '12': 'Votre compte a été suspendu',
  '13': "Votre limite d'envoi paramétrée est atteinte",
  '14': "Votre limite d'envoi paramétrée est atteinte",
  '15': "Votre limite d'envoi paramétrée est atteinte",
  '17': "L'expéditeur n'est pas autorisé",
  '18': 'Le sujet est trop court',
  '19': "L'e-mail de réponse est invalide",
  '20': "Le nom d'expéditeur est trop court",
  '21': 'Token invalide',
  '30': 'Clé API non reconnue',
  '31': 'Un lien inséré dans votre message est invalide',
  '45': "Ce produit n'est pas activé",
  '52': 'Limite maximale de 50 campagnes en brouillons atteinte',
  '55': 'Contenu nécessitant une vérification, contacter le service client',
  '62': "Votre limite d'envoi est atteinte",
  '63': 'Vous avez dépassé votre limite de requêtes api',
  '65': 'Une maintenance est prévue sur ce créneau horaire',
  '66': 'Campagne bloquée préventivement (similaire à une campagne déjà envoyée)',
  '67': "Le nom d'expéditeur ne peut contenir une adresse email",
  '71': "Les envois sont actuellement indisponibles en raison d'un incident en cours",
  '99': 'Une maintenance est prévue sur ce créneau horaire',
  '100': 'Ip non autorisée',
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Error: ${name} is not set`);
  }
  return value;
};

export const buildEmailUrl = (): URL =>
  new URL(EMAIL_PATH, process.env.LINK_MOBILITY_API_URL || DEFAULT_BASE_URL);

// Pure request-body builder, exported for tests. Plain recipients are sent as
// a comma-separated list; with `variables` they are encoded PHP-array style
// (destinataires[email][champ]=valeur) under destinataires_type=datas.
// `erreur_texte: 1` asks the API to return human-readable error messages
// alongside the codes.
export const buildEmailRequestBody = (params: TransactionalEmailParams): URLSearchParams => {
  if (params.recipients.length === 0) {
    throw new Error('Error: at least one recipient is required');
  }
  if ((params.html === undefined) === (params.templateId === undefined)) {
    throw new Error('Error: provide exactly one of html or templateId');
  }

  const body = new URLSearchParams({
    key: requireEnv('LINK_MOBILITY_API_KEY'),
    sujet: params.subject,
    message: params.html ?? String(params.templateId),
    expediteur: params.senderEmail ?? requireEnv('LINK_MOBILITY_SENDER_EMAIL'),
    nom_expediteur: params.senderName ?? requireEnv('LINK_MOBILITY_SENDER_NAME'),
    erreur_texte: '1',
  });

  if (params.templateId !== undefined) {
    body.set('type_message', 'creation');
  }

  if (params.variables) {
    const missing = params.recipients.filter((email) => !params.variables?.[email]);
    if (missing.length > 0) {
      throw new Error(`Error: missing variables for recipient(s): ${missing.join(', ')}`);
    }
    body.set('destinataires_type', 'datas');
    for (const email of params.recipients) {
      for (const [field, value] of Object.entries(params.variables[email])) {
        body.append(`destinataires[${email}][${field}]`, String(value));
      }
    }
  } else {
    body.set('destinataires', params.recipients.join(','));
  }

  if (params.replyTo) body.set('email_reponse', params.replyTo);
  if (params.name) body.set('nom', params.name);
  if (params.alternativeText) body.set('alternatif', params.alternativeText);

  return body;
};

interface LinkMobilityRawResponse {
  resultat: number;
  id?: number;
  erreurs?: string | number;
  erreur_texte?: string;
}

// Maps the raw {resultat, id | erreurs} payload to a discriminated result.
// Exported for tests.
export const parseSendEmailResponse = (raw: LinkMobilityRawResponse): SendEmailResult => {
  if (raw.resultat === 1 && raw.id !== undefined) {
    return { sent: true, campaignId: raw.id };
  }

  const errorCodes = String(raw.erreurs ?? '')
    .split(',')
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

export interface EmailTemplate {
  id: number;
  name: string;
  date_creation: number;
  date_update: number;
}

// Lists the emailing templates registered on the account (output=1 filters the
// "Maquette Email" medias) — use it to find the `templateId` to send with.
export const listEmailTemplates = async (): Promise<EmailTemplate[]> => {
  const url = new URL(TEMPLATES_PATH, process.env.LINK_MOBILITY_API_URL || DEFAULT_BASE_URL);
  const body = new URLSearchParams({ key: requireEnv('LINK_MOBILITY_API_KEY'), output: '1' });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Request to Link Mobility on ${TEMPLATES_PATH} has failed. Response status is ${response.status}.`,
    );
  }

  const raw = (await response.json()) as Array<{
    id: number;
    name: string;
    date_creation: number;
    date_update: number;
  }>;

  return raw.map(({ id, name, date_creation, date_update }) => ({
    id,
    name,
    date_creation,
    date_update,
  }));
};

export const sendTransactionalEmail = async (
  params: TransactionalEmailParams,
): Promise<SendEmailResult> => {
  const body = buildEmailRequestBody(params);

  const response = await fetch(buildEmailUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `Request to Link Mobility on ${EMAIL_PATH} has failed. Response status is ${response.status}.`,
    );
  }

  const result = parseSendEmailResponse((await response.json()) as LinkMobilityRawResponse);

  if (!result.sent) {
    Sentry.withScope((scope) => {
      scope.setLevel('warning');
      scope.setExtra('errorCodes', result.errorCodes);
      scope.setExtra('errorMessages', result.errorMessages);
      scope.captureMessage('Link Mobility rejected a transactional email');
    });
  }

  return result;
};
