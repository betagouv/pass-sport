// Script first ran on the 9th december 2024
// Context: We needed to send a message to the remaining conversations that were
// unresolved, unassigned, not from LSM, DRAJES, DSRGPD
// in order to have fresh & relevant replies from people in need
// Once the message is sent, the conversation is resolved, and any time the conversation is resumed,
// the conversation's state rolls back to "unresolved"
// Te CRISP API is called thousands of times, it is a very unstable API so the script had to be re-ran multiple times
import { z } from 'zod';
import got from 'got';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

function logError(sessionId, message) {
  const timestamp = new Date().toISOString(); // Timestamp for logging
  const logFilePath = path.join(__dirname, 'logs-crisp.txt');

  // Format the log message
  const logMessage = `[${timestamp}]${sessionId ?? `[${sessionId}]`}ERROR: ${message}\n`;

  // Append to a log file
  fs.appendFile(logFilePath, logMessage, (err) => {
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

// Scenario
// Send message in all conversations unresolved, and unassigned and not coming from DRAJES, LSM, DSRGPD
// Then close these conversations
const { envVars } = initCrispClient();

const options = {
  headers: {
    Authorization: `Basic ${btoa(`${envVars.CRISP_IDENTIFIER}:${envVars.CRISP_KEY}`)}`,
    'X-Crisp-Tier': 'plugin',
  },
};

async function main(totalPages) {
  const logs = [];
  let totalImpacted = 0;

  for (let i = 1; i < totalPages; i++) {
    console.log(`processing batch ${i}...`);

    execSync('sleep 1');
    const conversations = await getConversations({ pageNumber: i, pageSize: 50 });
    execSync('sleep 1');

    totalImpacted += await processConversations(conversations, logs);

    console.log(`batch ${i} processed.`);
  }

  console.log(`Total impacted ${totalImpacted}`);

  console.log('Writing logs...');
  fs.writeFileSync('./send-in-mass-crisp-logs.txt', JSON.stringify(logs));
  console.log('Finished writing logs');
}

async function getConversations({ pageNumber, pageSize } = { pageNumber: 1, pageSize: 50 }) {
  try {
    const dateStart = '2024-12-06T00:00:00.000Z';
    const dateEnd = '2024-12-12T22:00:00.000Z';

    const { data } = await got(
      `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversations/${pageNumber}?filter_not_resolved=1&filter_unassigned=1&per_page=${pageSize}&filter_date_start=${dateStart}&filter_date_end=${dateEnd}`,
      { ...options, responseType: 'json' },
    ).json();

    return data;
  } catch (err) {
    console.log('Error occurred while fetching conversations', err.code);
    logError(null, err);
    return [];
  }
}

async function processConversations(conversations = [], logs = []) {
  let count = 0;

  for (let conversation of conversations) {
    const sessionId = conversation.session_id;

    if (isValidConversation(conversation) && sessionId) {
      console.log(`Processing message ${sessionId}`);

      try {
        await sendMessageInConversation(sessionId);
        execSync('sleep 1');
      } catch (err) {
        console.log(`Error while sending message to ${sessionId}`);
        logError(sessionId, err);
        logs.push({
          sessionId,
          messageSent: false,
          err,
        });
      }

      try {
        await resolveConversation(sessionId);
      } catch (err) {
        console.log(`Error while resolving message from ${sessionId}`, err);
        logError(sessionId, err);
        logs.push({
          sessionId,
          messageSent: true,
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
  const message = `Bonjour,
Je vous remercie pour votre message, et vous prie de bien vouloir nous excuser pour le délai de réponse, dû à un fort volume de demandes reçues.
Votre problématique est-elle toujours d'actualité ou a-t-elle été résolue entre-temps ?
Je vous invite à revenir vers nous si cela est toujours le cas.
Vous remerciant par avance pour votre retour, je vous souhaite une agréable journée.
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

function isValidConversation(conversation) {
  // Les filtres correspondants :
  // DRAJES => segment = est-drajes
  // LSM => email = lsm.pass.sport@sports.gouv.fr
  // RGPD => email = ds-rgpd@sports.gouv.fr
  const meta = conversation.meta;
  const invalidSegments = ['est-drajes'];
  const invalidEmails = ['lsm.pass.sport@sports.gouv.fr', 'ds-rgpd@sports.gouv.fr'];

  const hasValidSegment = !meta.segments.some((segment) =>
    invalidSegments.some((invalidSegment) => invalidSegment === segment),
  );

  const hasValidEmails = !invalidEmails.some((invalidEmail) => invalidEmail === meta.email);

  return hasValidSegment && hasValidEmails;
}

// Prior to executing the main script (main()), check the number of conversations from getConversations() manually
// Execute here main()
