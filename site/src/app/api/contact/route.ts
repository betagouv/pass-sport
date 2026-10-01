import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { ZodError } from 'zod';
import { initCrispClient } from '@/utils/crisp';
import { decodeSupportCookie, SupportAttempt, SupportData } from '@/utils/cookie';
import { AUTHORIZED_VENDORS_KEY, SUPPORT_COOKIE_KEY } from '@/app/constants/cookie-manager';
import { matchExactDrajes, matchExactLsm } from '@/utils/string';
import { ContactRequestBody, contactFormSchema } from '@/app/api/contact/schema';

const { crispClient, envVars } = initCrispClient();

export async function POST(request: NextRequest): Promise<Response> {
  const cookies = request.cookies;
  const supportData = hasGivenConsentForSupportCookie(cookies)
    ? decodeSupportCookie(cookies.get(SUPPORT_COOKIE_KEY)?.value)
    : null;

  let body: ContactRequestBody;

  try {
    body = contactFormSchema.parse(await request.json());
  } catch (e) {
    if (e instanceof ZodError || e instanceof SyntaxError) {
      return new NextResponse((e as Error).message, { status: 400 });
    }

    throw e;
  }

  const { isProRequest, firstname, lastname, email, reason, message, siret, rna } = body;

  try {
    const conversation = await crispClient.website.createNewConversation(envVars.CRISP_WEBSITE);

    if (!conversation.session_id) {
      return new NextResponse('Failed to create conversation', { status: 500 });
    }

    const sessionId = conversation.session_id;

    const byWhoSegment = isProRequest ? 'Pro' : 'Particulier';
    const failedAttemptSegment = supportData?.attempts.length ? 'tentative-code' : null;
    const franceConnectSegment = supportData?.franceConnect ? 'france-connect' : null;
    const drajesSegment = 'est-drajes';
    const lsmSegment = 'est-lsm';

    // Keyword-based routing is spoofable by design: anyone typing the magic word gets the
    // segment. Accepted risk — the segments only drive support triage, no entitlement.
    const isFromDrajes = matchExactDrajes(message);
    const isFromLsm = matchExactLsm(message);

    await crispClient.website.updateConversationMetas(envVars.CRISP_WEBSITE, sessionId, {
      nickname: `${firstname} ${lastname}`,
      email,
      data: { email, siret: siret || '', rna: rna || '' },
      segments: [
        byWhoSegment,
        reason,
        failedAttemptSegment,
        franceConnectSegment,
        isFromDrajes ? drajesSegment : null,
        isFromLsm ? lsmSegment : null,
      ].filter((s): s is string => Boolean(s)),
    });

    await crispClient.website.sendMessageInConversation(envVars.CRISP_WEBSITE, sessionId, {
      type: 'text',
      from: 'user',
      origin: 'urn:pass-sport',
      content: message,
    });

    // Writing private note, with the FranceConnect usage and all attempts
    if (supportData !== null) {
      // Delay needed for the note to not appear first in some situations
      await new Promise((resolve) => setTimeout(resolve, 150));
      await crispClient.website.sendMessageInConversation(envVars.CRISP_WEBSITE, sessionId, {
        type: 'note',
        from: 'operator',
        origin: 'urn:pass-sport',
        content: `${formatNote(supportData)}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      await crispClient.website.changeConversationState(
        envVars.CRISP_WEBSITE,
        sessionId,
        'pending',
      );
    }

    return new NextResponse(null, { status: 201 });
  } catch (e) {
    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.captureMessage('Contact form submission to Crisp failed');
      scope.captureException(e);
    });

    return new NextResponse('Failed to create conversation', { status: 500 });
  }
}

function hasGivenConsentForSupportCookie(cookies: NextRequest['cookies']) {
  return Boolean(cookies.get(AUTHORIZED_VENDORS_KEY)?.value.includes(`${SUPPORT_COOKIE_KEY}=true`));
}

function formatNote({ attempts, franceConnect }: SupportData) {
  const franceConnectLine = franceConnect
    ? `Connexion FranceConnect -> oui, le ${formatParisDate(franceConnect.connectedAt)} (allocataire_fc_sub -> ${franceConnect.allocataire_fc_sub})`
    : 'Connexion FranceConnect -> non';

  return [franceConnectLine, formatAttempts(attempts)].filter(Boolean).join('\n\n');
}

function formatParisDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

function formatAttempts(attempts: SupportAttempt[]) {
  let mapping: { [key: string]: string } = {
    attemptNumber: 'Tentative numéro',
    id: 'Id du bénéficiaire en base',
    situation: 'Situation du bénéficiaire',
    organisme: 'Organisme du bénéficiaire',
    beneficiaryLastname: 'Nom du bénéficiaire',
    beneficiaryFirstname: 'Prénom du bénéficiaire',
    beneficiaryBirthDate: 'Date de naissance du bénéficiaire',
    recipientResidencePlace: 'Lieu de résidence',
    recipientLastname: `Nom de l'allocataire`,
    recipientFirstname: `Prénom de l'allocataire`,
    recipientCafNumber: `Matricule CAF de l'allocataire`,
    recipientBirthPlace: `Lieu de naissance de l'allocataire`,
    recipientBirthCountry: `Pays de naissance de l'allocataire`,
    step: 'Etape du formulaire',
    allowanceName: `Nom de l'allocation`,
    isFromCrous: 'Provenant du CROUS',
  };

  let formattedNote = attempts.map((obj, index) => {
    // Augment the object to add the attempt number key/value pair
    let _attempts = { attemptNumber: index + 1, ...obj };

    return Object.keys(_attempts)
      .map((key) => {
        const _key = mapping[key] ? mapping[key] : key;
        const value = _attempts[key as keyof typeof _attempts];

        return `${_key} -> ${value}`;
      })
      .join('\n');
  });

  return formattedNote.join('\n\n');
}
