import type { BeneficiaryCandidate } from "../lca/types";
import { type SendEmailResult, sendTransactionalEmail } from "./link-mobility";

// If the matching LINK_MOBILITY_TEMPLATE_* env holds a template id, send with that
// templateId; otherwise fall back to the inline HTML below.
const templateIdFrom = (envVar: string): number | undefined => {
  const raw = process.env[envVar];
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
};

async function deliver(
  recipient: string | undefined,
  opts: {
    subject: string;
    name: string;
    alternativeText: string;
    html: string;
    templateEnv: string;
    // Merge fields for the Link Mobility template. Only meaningful in templateId mode —
    // the inline HTML below already has the values interpolated.
    variables?: Record<string, string | number>;
  },
): Promise<SendEmailResult | null> {
  if (!recipient) return null;
  const templateId = templateIdFrom(opts.templateEnv);
  return sendTransactionalEmail({
    subject: opts.subject,
    recipients: [recipient],
    name: opts.name,
    alternativeText: opts.alternativeText,
    ...(templateId !== undefined && opts.variables
      ? { variables: { [recipient]: opts.variables } }
      : {}),
    // Exactly one of templateId / html (the wrapper enforces this).
    ...(templateId !== undefined ? { templateId } : { html: opts.html }),
  });
}

// Names and codes come from FranceConnect / API Particulier / LCA and are dropped
// into HTML — escape them rather than trusting an upstream to never return a `<`.
const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

// One line of the recapitulative email: a beneficiary and the verdict for them.
// Prénom AND nom, so a parent with several children can tell the lines apart.
export type DigestEntry = {
  firstname: string;
  lastname: string;
  kind: "code" | "eligible_soon" | "not_eligible";
  code?: string;
};

// Who the email is addressed to. FranceConnect splits the two name fields:
// `family_name` is the nom de naissance, `preferred_username` the nom d'usage —
// prefer the latter when present, it is the name the person goes by.
export type DigestRecipientIdentity = {
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
};

const fullName = (firstname: string | undefined, lastname: string | undefined): string =>
  [firstname, lastname].filter(Boolean).join(" ").trim();

const listHtml = (entries: DigestEntry[], render: (e: DigestEntry) => string): string =>
  `<ul>${entries.map((e) => `<li>${render(e)}</li>`).join("")}</ul>`;

// A single email per allocataire covering every beneficiary of the job (themselves
// and/or their children), rather than one email per beneficiary — the allocataire's
// inbox is the same for all of them.
//
// Written in the third person on purpose: the recipient is the allocataire, while the
// beneficiary named on each line is usually their child. "Bonjour {prénom de
// l'enfant}, vous êtes éligible" addressed the wrong person for both.
//
// The site shows the code too, from eligibility_results. This email stays the durable
// copy: the on-screen recap needs a live FranceConnect session to be reachable at all.
export function sendBeneficiaryDigestEmail(
  recipient: string | undefined,
  entries: DigestEntry[],
  allocataire?: DigestRecipientIdentity,
): Promise<SendEmailResult | null> {
  if (entries.length === 0) {
    return Promise.resolve(null);
  }
  const codes = entries.filter((e) => e.kind === "code" && e.code);
  const soon = entries.filter((e) => e.kind === "eligible_soon");
  const notEligible = entries.filter((e) => e.kind === "not_eligible");

  const subject =
    codes.length > 1
      ? "Vos codes pass Sport"
      : codes.length === 1
        ? "Votre code pass Sport"
        : "Votre demande pass Sport";

  const allocataireName = fullName(
    allocataire?.given_name,
    allocataire?.preferred_username || allocataire?.family_name,
  );
  const salutation = allocataireName ? `Bonjour ${allocataireName},` : "Bonjour,";
  const greeting = allocataireName ? `Bonjour ${escapeHtml(allocataireName)},` : "Bonjour,";
  const who = (e: DigestEntry): string => fullName(e.firstname, e.lastname);

  const sections: string[] = [];
  const lines: string[] = [];

  if (codes.length > 0) {
    sections.push(
      `<p>${codes.length > 1 ? "Les codes pass Sport suivants sont disponibles" : "Le code pass Sport suivant est disponible"}&nbsp;:</p>`,
      listHtml(
        codes,
        (e) =>
          `${escapeHtml(who(e))}&nbsp;: <strong style="font-size:18px">${escapeHtml(e.code ?? "")}</strong>`,
      ),
      `<p>Présentez ${codes.length > 1 ? "chaque code" : "ce code"} à une structure sportive partenaire pour bénéficier de l'aide.</p>`,
    );
    lines.push(...codes.map((e) => `- ${who(e)} : code pass Sport ${e.code}`));
  }

  if (soon.length > 0) {
    sections.push(
      `<p>Éligibilité confirmée, code à venir&nbsp;:</p>`,
      listHtml(soon, (e) => escapeHtml(who(e))),
      `<p>Le code sera envoyé prochainement par e-mail.</p>`,
    );
    lines.push(...soon.map((e) => `- ${who(e)} : éligible, code à venir`));
  }

  if (notEligible.length > 0) {
    sections.push(
      `<p>D'après les informations disponibles, aucun droit n'a été trouvé pour&nbsp;:</p>`,
      listHtml(notEligible, (e) => escapeHtml(who(e))),
      `<p>Si vous pensez qu'il s'agit d'une erreur, rapprochez-vous d'une structure partenaire.</p>`,
    );
    lines.push(...notEligible.map((e) => `- ${who(e)} : aucun droit trouvé`));
  }

  return deliver(recipient, {
    subject,
    // Constant campaign name: Link Mobility indexes it as searchable metadata on
    // their side, so it must never carry a pass Sport code.
    name: "pass-sport-recapitulatif",
    alternativeText: `${salutation}\n${lines.join("\n")}`,
    templateEnv: "LINK_MOBILITY_TEMPLATE_DIGEST",
    html: [`<p>${greeting}</p>`, ...sections].join("\n").trim(),
  });
}

// The two outcomes of the no-FranceConnect form. Unlike the FranceConnect digest, this path
// knows exactly one beneficiary and exactly one recipient — the address the usager typed at
// step two — so it gets its own pair of templates rather than a bucketed recap.
//
// The code only ever appears in the success mail, which is sent only when the typed address
// is the one LCA already holds for the allocataire.
export function sendLcaOutcomeEmail(
  recipient: string | undefined,
  params: {
    outcome: "success" | "failure";
    beneficiary: { firstname: string; lastname: string };
    code?: string;
  },
): Promise<SendEmailResult | null> {
  const { outcome, beneficiary, code } = params;
  const prenom = beneficiary.firstname;
  const nom = beneficiary.lastname;
  const who = fullName(prenom, nom);

  if (outcome === "success") {
    return deliver(recipient, {
      subject: "Votre code pass Sport",
      // Constant campaign name: Link Mobility indexes it as searchable metadata on their
      // side, so it must never carry the code.
      name: "pass-sport-lca-succes",
      alternativeText: `Bonjour,\n${who} : code pass Sport ${code ?? ""}`,
      templateEnv: "LINK_MOBILITY_TEMPLATE_LCA_SUCCESS",
      variables: { code: code ?? "", prenom, nom },
      html: `
    <p>Bonjour,</p>
    <p>Le code pass Sport de ${escapeHtml(who)} est&nbsp;: <strong style="font-size:18px">${escapeHtml(code ?? "")}</strong></p>
    <p>Présentez ce code à une structure sportive partenaire pour bénéficier de l'aide.</p>
  `.trim(),
    });
  }

  return deliver(recipient, {
    subject: "Votre demande pass Sport",
    name: "pass-sport-lca-echec",
    alternativeText: `Bonjour,\nAucun droit n'a pu être confirmé pour ${who}.`,
    templateEnv: "LINK_MOBILITY_TEMPLATE_LCA_FAILURE",
    variables: { prenom, nom },
    html: `
    <p>Bonjour,</p>
    <p>D'après les informations disponibles, aucun droit n'a pu être confirmé pour ${escapeHtml(who)}.</p>
    <p>Si vous pensez qu'il s'agit d'une erreur, rapprochez-vous d'une structure partenaire.</p>
  `.trim(),
  });
}

// Gates the combined form: nothing is enqueued until this link is opened. It is not a login
// and carries no verdict and no code — opening it only starts the processing whose result
// goes back to this same address, so an intercepted link discloses nothing.
export function sendVerificationEmail(
  recipient: string | undefined,
  link: string,
): Promise<SendEmailResult | null> {
  const href = escapeHtml(link);
  return deliver(recipient, {
    subject: "Confirmez votre adresse e-mail — pass Sport",
    // Constant campaign name, like the digest: Link Mobility indexes it as searchable
    // metadata, so it must never carry the token.
    name: "pass-sport-verification-email",
    alternativeText: `Bonjour,\nConfirmez votre adresse e-mail pour lancer le traitement de votre demande pass Sport :\n${link}\nCe lien est valable 24 heures.`,
    templateEnv: "LINK_MOBILITY_TEMPLATE_EMAIL_VERIFICATION",
    variables: { lien: link },
    html: `
    <p>Bonjour,</p>
    <p>Confirmez votre adresse e-mail pour lancer le traitement de votre demande pass Sport&nbsp;:</p>
    <p><a href="${href}">Confirmer mon adresse e-mail</a></p>
    <p>Ce lien est valable 24&nbsp;heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail&nbsp;: aucun traitement ne sera lancé.</p>
  `.trim(),
  });
}

// Eligible but NOT found in LCA -> "code coming soon".
export function sendEligibleSoonEmail(
  recipient: string | undefined,
  candidate: BeneficiaryCandidate,
): Promise<SendEmailResult | null> {
  const prenom = candidate.firstname;
  return deliver(recipient, {
    subject: "Vous êtes éligible au pass Sport",
    name: "pass-sport-eligible-soon",
    alternativeText: `Bonjour ${prenom}, vous êtes éligible au pass Sport. Votre code arrivera prochainement.`,
    templateEnv: "LINK_MOBILITY_TEMPLATE_ELIGIBLE_SOON",
    html: `
    <p>Bonjour ${prenom},</p>
    <p>Bonne nouvelle&nbsp;: vous êtes éligible au pass Sport.</p>
    <p>Votre code n'est pas encore disponible. Vous le recevrez prochainement par e-mail.</p>
  `.trim(),
  });
}

// NOT found in LCA AND not eligible -> "not eligible" notice.
export function sendNotEligibleEmail(
  recipient: string | undefined,
  candidate: BeneficiaryCandidate,
): Promise<SendEmailResult | null> {
  const prenom = candidate.firstname;
  return deliver(recipient, {
    subject: "Votre demande pass Sport",
    name: "pass-sport-not-eligible",
    alternativeText: `Bonjour ${prenom}, vous n'êtes pas éligible au pass Sport selon les informations disponibles.`,
    templateEnv: "LINK_MOBILITY_TEMPLATE_NOT_ELIGIBLE",
    html: `
    <p>Bonjour ${prenom},</p>
    <p>D'après les informations disponibles, vous n'êtes pas éligible au pass Sport.</p>
    <p>Si vous pensez qu'il s'agit d'une erreur, rapprochez-vous d'une structure partenaire.</p>
  `.trim(),
  });
}
