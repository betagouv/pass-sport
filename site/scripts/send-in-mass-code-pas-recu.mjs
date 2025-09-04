/**
 * Issue date: 4th september 2025
 * Context: Due to the high volume of CRISP conversations
 *          We needed to send a message to all the people that has segment SEGMENT_CODE_PAS_RECU that remind them of the eligibility criterias
 * Process : Select all crisp conversations not resolved, with the segments SEGMENT_CODE_PAS_RECU and SEGMENT_CODE_PAS_RECU_TRAITE
 *           We need to also filter the segment SEGMENT_CODE_PAS_RECU_TRAITE because people can accidentally
 *           open a resolved conversation and its state would rollback to unresolved
 * */
import { z } from 'zod';
import got from 'got';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const LOGS_PATH = './logs-crisp-code-pas-recu-2025.txt';
const LOGS_ERROR_PATH = './logs-crisp-error-code-pas-recu-2025.txt';
const SEGMENT_CODE_PAS_RECU = 'code-pas-reçu';
const SEGMENT_CODE_PAS_RECU_TRAITE = 'code-pas-reçu-traite';
const LAST_MESSAGE_SNIPPET = 'Plusieurs raisons peuvent expliquer que vous n’ayez pas reçu le code';

// If the last message contains the snippet, we don't do anything except adding segment SEGMENT_CODE_RECU_TRAITE
const REGEX_ELIGIBILITY_MESSAGE = new RegExp(LAST_MESSAGE_SNIPPET, 'i');
const DEFAULT_TIMEOUT = 'sleep 1';

let conversation_counter = 0;

function logError(sessionId, message) {
  const timestamp = new Date().toISOString(); // Timestamp for logging

  // Format the log message
  const logMessage = `[${timestamp}]${sessionId ?? `[${sessionId}]`}ERROR: ${message}\n`;

  // Append to a log file
  fs.appendFile(LOGS_ERROR_PATH, logMessage, (err) => {
    if (err) {
      console.error('Failed to write to log file:', err);
    }
  });
}

export function initCrispClient() {
  const envSchema = z.object({
    CRISP_IDENTIFIER: z.string(),
    CRISP_KEY: z.string(),
    CRISP_WEBSITE: z.string(),
  });

  const envVars = envSchema.parse({
    CRISP_IDENTIFIER: process.env.CRISP_IDENTIFIER,
    CRISP_KEY: process.env.CRISP_KEY,
    CRISP_WEBSITE: process.env.CRISP_WEBSITE,
  });

  return {
    envVars,
  };
}

const { envVars } = initCrispClient();

const options = {
  headers: {
    Authorization: `Basic ${btoa(`${envVars.CRISP_IDENTIFIER}:${envVars.CRISP_KEY}`)}`,
    'X-Crisp-Tier': 'plugin',
  },
};

async function main() {
  const logs = [];
  let totalImpacted = 0;

  let results = await getConversations();
  let i = 1;

  if (results.length <= 0) {
    console.debug(`Total impacted 0`);
    return;
  }

  do {
    console.debug(`processing batch ${i}...`);

    execSync(DEFAULT_TIMEOUT);
    totalImpacted += await processConversations(results, logs);
    execSync(DEFAULT_TIMEOUT);

    if (results?.length > 0) {
      results = await getConversations();
      execSync(DEFAULT_TIMEOUT);
    }

    console.debug(`batch ${i++} processed.`);
  } while (results.length > 0);

  console.debug(`Total impacted ${totalImpacted}`);
  console.debug('Writing logs...');

  fs.writeFileSync(LOGS_PATH, JSON.stringify(logs));

  console.debug('Finished writing logs');
}

async function getConversations() {
  try {
    console.debug('Getting data');
    const url = new URL(`https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversations`);

    url.searchParams.append('filter_not_resolved', 1);
    url.searchParams.append('search_type', 'filter');
    url.searchParams.append('search_operator', 'and');

    url.searchParams.append(
      'search_query',
      `[{"criterion":"meta.segments","query":["${SEGMENT_CODE_PAS_RECU}"],"model":"conversation","operator":"eq","_$":{"id":"41b825da-d91c-4954-b40b-c4e525b583ce","criterionId":"conversation_meta.segments"}},{"criterion":"meta.segments","query":["${SEGMENT_CODE_PAS_RECU_TRAITE}"],"model":"conversation","operator":"neq","_$":{"id":"08e01139-f9ab-46b5-bf30-1fa8526dd969","criterionId":"conversation_meta.segments"}}]`,
    );

    const { data } = await got(url, { ...options, responseType: 'json' }).json();

    console.debug(`Finished fetching data, ${data?.length} results found`);
    return data;
  } catch (err) {
    console.error('Error occurred while fetching conversations', err);
    logError(null, err);
    return [];
  }
}

async function processConversations(conversations = [], logs = []) {
  let count = 0;

  for (let conversation of conversations) {
    const sessionId = conversation?.session_id;

    if (sessionId) {
      console.debug(`Processing message ${sessionId}`);

      try {
        const messageAlreadySent = await messageAlreadySentInConversation(sessionId);

        if (!messageAlreadySent) {
          console.debug(`Message being sent in ${sessionId}`);
          await sendMessageInConversation(sessionId);
          execSync(DEFAULT_TIMEOUT);
        }

        try {
          const existingSegments = conversation?.meta?.segments ?? [];

          await updateSegments({ sessionId, existingSegments });
          execSync(DEFAULT_TIMEOUT);

          await resolveConversation(sessionId);
        } catch (err) {
          console.debug(`Error while resolving message from ${sessionId}`, err);
          logError(sessionId, err);
          logs.push({
            sessionId,
            messageSent: true,
            err,
          });
        }
      } catch (err) {
        console.debug(`Error while sending message to ${sessionId}`);
        logError(sessionId, err);
        logs.push({
          sessionId,
          messageSent: false,
          err,
        });
      }

      count += 1;
    }
  }

  return count;
}

async function sendMessageInConversation(sessionId) {
  // https://docs.crisp.chat/references/rest-api/v1/#send-a-message-in-conversation
  // https://api.crisp.chat/v1/website/website_id/conversation/session_id/message
  const message = `
Bonjour,

Plusieurs raisons peuvent expliquer que vous n’ayez pas reçu le code :

1- Vous n'êtes plus éligible au pass Sport 2025. Les conditions d'éligibilité ont changé. **Les jeunes de 6 à 13 ans bénéficiaires de l'Allocation de Rentrée Scolaire ne sont plus éligibles.**

2- Il se peut que certains enfants d’une même famille soient éligibles au pass Sport et d’autres non.
[TESTER L'ÉLIGIBILITÉ](https://www.pass.sports.gouv.fr/v2/test-eligibilite-base) de chaque enfant.

3- Vous êtes éligible. Le code a été envoyé par email à l’adresse communiquée par votre organisme social. Avez-vous vérifié votre boite email et vos courriers indésirables ? Si vous n’avez rien reçu, vous pouvez récupérer votre code directement en ligne : [RÉCUPÉRER MON PASS SPORT](https://www.pass.sports.gouv.fr/v2/test-eligibilite).

4- Votre enfant bénéficie de l’AEEH et a entre 6 et 13 ans, ou entre 18 et 19 ans. Un code pass Sport doit être créé. Faites-en la demande directement sur le site officiel : [CLIQUEZ ICI](https://www.pass.sports.gouv.fr/v2/test-eligibilite)

5- Vous êtes étudiant boursier. Vous recevrez votre code par email entre mi-octobre et mi-novembre 2025.

Nous restons à votre disposition.
Bien à vous,
L'équipe pass Sport`;

  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/message`,
    {
      ...options,
      method: 'POST',
      json: {
        type: 'text',
        from: 'operator',
        origin: 'chat',
        content: message,
        user: {
          type: 'website',
          nickname: 'Equipe pass Sport',
        },
      },
      responseType: 'json',
    },
  ).json();
}

async function resolveConversation(sessionId) {
  console.debug(`About to resolve conversation ${sessionId}`);

  // https://docs.crisp.chat/references/rest-api/v1/#change-conversation-state
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/state`,
    {
      ...options,
      method: 'PATCH',
      json: {
        state: 'resolved',
      },
      responseType: 'json',
    },
  ).json();

  console.debug(`Finished resolving conversation ${sessionId}`);
}

async function messageAlreadySentInConversation(sessionId) {
  console.debug(`Checking if message was already sent in the conversation ${sessionId}`);

  const { data } = await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/messages`,
    {
      ...options,
      method: 'GET',
      responseType: 'json',
    },
  ).json();

  if (Array.isArray(data)) {
    return data.some((message) => REGEX_ELIGIBILITY_MESSAGE.test(message?.content));
  }

  console.debug(`Finished checking if message was already sent in the conversation ${sessionId}`);

  return false;
}

async function updateSegments({ sessionId, existingSegments }) {
  console.debug(`Updating segments to add ${SEGMENT_CODE_PAS_RECU_TRAITE} to ${sessionId}`);

  // https://docs.crisp.chat/references/rest-api/v1/#update-conversation-metas
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/meta`,
    {
      ...options,
      method: 'PATCH',
      json: {
        segments: [...existingSegments, SEGMENT_CODE_PAS_RECU_TRAITE],
      },
      responseType: 'json',
    },
  ).json();

  console.debug(`Finished updating segments for ${sessionId}`);
}

// Prior to executing the main script (main()), check the number of conversations from getConversations() manually
// Execute here main()
await main(1);
// await getConversations();
