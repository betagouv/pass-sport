/**
 * Issue date: 2nd september 2025
 * Context: Due to the high volume of CRISP conversations
 *          We needed to send a message to all the people asking for code for AEEH
 *          And to then send a DEMARCHES SIMPLIFIEES link that contains a form
 * Process : Select all crisp conversations not resolved, with the segments "demande-code-aeeh" and "aeeh-traite"
 *           We need to also filter the segment "aeeh-traite" because people can accidentally
 *           open a resolved conversation and its state would rollback to unresolved
 * Warning: The CRISP API is called thousands of times, it is a very unstable API so the script had to be re-ran multiple times
 * */
import { z } from 'zod';
import got from 'got';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const LOGS_PATH = './logs-crisp-aeeh-2025.txt';
const LOGS_ERROR_PATH = './logs-crisp-error-aeeh-2025.txt';
const SEGMENT_AEEH_CODE_QUERY = 'demande-code-aeeh';
const SEGMENT_AEEH_ALREADY_PROCESSED = 'aeeh-traite';

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

  do {
    console.debug(`processing batch ${i}...`);

    execSync('sleep 1');

    totalImpacted += await processConversations(results, logs);

    execSync('sleep 1');

    if (results?.length > 0) {
      results = await getConversations();
    }

    console.debug(`batch ${i++} processed.`);
  } while (results.length > 0);

  console.debug(`Total impacted ${totalImpacted}`);
  console.debug('Writing logs...');

  console.debug({ logs });
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

    // todo: update to target correct segment, replace "test-patrick" by SEGMENT_AEEH_CODE_QUERY
    url.searchParams.append(
      'search_query',
      '[{"criterion":"meta.segments","query":["test-patrick"],"model":"conversation","operator":"eq","_$":{"id":"41b825da-d91c-4954-b40b-c4e525b583ce","criterionId":"conversation_meta.segments"}},{"criterion":"meta.segments","query":["aeeh-traite"],"model":"conversation","operator":"neq","_$":{"id":"08e01139-f9ab-46b5-bf30-1fa8526dd969","criterionId":"conversation_meta.segments"}}]',
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
        await sendMessageInConversation(sessionId);
        execSync('sleep 1');
        try {
          const existingSegments = conversation?.meta?.segments ?? [];

          await updateSegments({ sessionId, existingSegments });
          execSync('sleep 1');

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
Cordialement,
L’équipe Pass Sport`;

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

async function updateSegments({ sessionId, existingSegments }) {
  // https://docs.crisp.chat/references/rest-api/v1/#update-conversation-metas
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/meta`,
    {
      ...options,
      method: 'PATCH',
      json: {
        segments: [...existingSegments, SEGMENT_AEEH_ALREADY_PROCESSED],
      },
      responseType: 'json',
    },
  ).json();
}

// Prior to executing the main script (main()), check the number of conversations from getConversations() manually
// Execute here main()
// await main(1);
// await getConversations();
