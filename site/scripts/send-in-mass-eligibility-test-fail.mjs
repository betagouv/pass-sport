/**
 * Context: Process conversations from 1st september to 16th september
 */
import { z } from 'zod';
import got from 'got';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const LOGS_PATH = './logs-crisp-eligibility-test-fail-2025.txt';
const LOGS_ERROR_PATH = './logs-crisp-error-eligibility-test-fail-2025.txt';
const DEFAULT_TIMEOUT = 'sleep 1';

const MESSAGE = `Trois raisons peuvent expliquer que vous n’ayez pas réussi à récupérer votre pass Sport en ligne `;
const REGEX_MESSAGE = new RegExp(MESSAGE, 'i');

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

let processedConversationsCount = 0;

async function main({ targetedSegments, segmentToAddAfterProcessing, startDate, endDate }) {
  const logs = [];
  let totalImpacted = 0;
  let results = await getConversations({
    targetedSegments,
    segmentToAddAfterProcessing,
    startDate,
    endDate,
  });

  let batchCount = 1;

  if (results.length <= 0) {
    console.debug(`Total impacted ${totalImpacted}`);
    return;
  }

  do {
    console.debug(`processing batch ${batchCount}...`);
    execSync(DEFAULT_TIMEOUT);

    totalImpacted += await processConversations(results, logs, segmentToAddAfterProcessing);
    execSync(DEFAULT_TIMEOUT);

    if (results?.length > 0) {
      results = await getConversations({
        targetedSegments,
        segmentToAddAfterProcessing,
        startDate,
        endDate,
      });
    }

    console.debug(`batch ${batchCount++} processed.`);
  } while (results.length > 0 && batchCount <= 300);

  console.debug(`Total impacted ${totalImpacted}`);
  console.debug('Writing logs...');

  fs.writeFileSync(LOGS_PATH, JSON.stringify(logs));
  console.debug('Finished writing logs');
}

async function getConversations({
  targetedSegments,
  segmentToAddAfterProcessing,
  startDate,
  endDate,
}) {
  try {
    console.debug('Getting data');
    const url = new URL(`https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversations`);

    url.searchParams.append('filter_not_resolved', 1);
    url.searchParams.append('search_type', 'filter');
    url.searchParams.append('search_operator', 'and');
    url.searchParams.append('filter_start_date', startDate);
    url.searchParams.append('filter_end_date', endDate);

    const querySegments = targetedSegments.map((segment) => `"${segment}"`).join(',');
    url.searchParams.append(
      'search_query',
      `[{"criterion":"meta.segments","query":[${querySegments}],"model":"conversation","operator":"eq","_$":{"id":"8c25672a-ec74-437c-90b5-2c9f08c702bf","criterionId":"conversation_meta.segments"}},{"criterion":"meta.segments","query":["${segmentToAddAfterProcessing}"],"model":"conversation","operator":"neq","_$":{"id":"bf05b061-06d0-45d5-a8c3-f95bae9f2fff","criterionId":"conversation_meta.segments"}}]`,
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

async function processConversations(conversations = [], logs = [], segmentToAddAfterProcessing) {
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

          await updateSegments({ sessionId, existingSegments, segmentToAddAfterProcessing });

          execSync(DEFAULT_TIMEOUT);

          if (!messageAlreadySent) {
            await resolveConversation(sessionId);
          }
          count++;
          console.debug(`${++processedConversationsCount} Conversations processed`);
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
    }
  }

  return count;
}

async function sendMessageInConversation(sessionId) {
  // https://docs.crisp.chat/references/rest-api/v1/#send-a-message-in-conversation
  // https://api.crisp.chat/v1/website/website_id/conversation/session_id/message
  const message = `Bonjour,

Trois raisons peuvent expliquer que vous n’ayez pas réussi à récupérer votre pass Sport en ligne :

1- **Vous n’êtes pas éligible**. Pour rappel, les jeunes de 6 à 13 ans bénéficiaires de l'Allocation de Rentrée Scolaire ne sont plus éligibles.
Vous pouvez vérifier votre droit au pass Sport grâce à ce test rapide : [TESTER MON ÉLIGIBILITÉ](https://www.pass.sports.gouv.fr/v2/test-eligibilite-base)

2- **Vous êtes éligible**, mais les informations renseignées sur le formulaire ne correspondent pas à nos données. Nous allons vous aider à récupérer votre pass Sport. Pouvez-vous nous donner le nom, prénom, date de naissance du jeune et si possible votre n° d'allocataire ?

3- **Vous êtes étudiant boursier éligible** au pass Sport. Le code vous sera envoyé automatiquement par e-mail entre mi-octobre et mi-novembre 2025.

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
}

async function updateSegments({ sessionId, existingSegments, segmentToAddAfterProcessing }) {
  // https://docs.crisp.chat/references/rest-api/v1/#update-conversation-metas
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/meta`,
    {
      ...options,
      method: 'PATCH',
      json: {
        segments: [...existingSegments, segmentToAddAfterProcessing],
      },
      responseType: 'json',
    },
  ).json();
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
    return data.some((message) => REGEX_MESSAGE.test(message?.content));
  }

  console.debug(`Finished checking if message was already sent in the conversation ${sessionId}`);

  return false;
}

await main({
  targetedSegments: ['eligibility-test-fail', 'tentative-code'],
  segmentToAddAfterProcessing: 'eligibility-test-fail-traite',
  startDate: '2025-09-01T00:00:00Z',
  endDate: '2025-09-16T21:59:59Z',
});
