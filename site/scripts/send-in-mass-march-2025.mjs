// Script first ran on the 10th march 2025
// Context: We needed to send a message to the remaining conversations that were
// unresolved, unassigned, not from LSM, DSRGPD
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
  const logFilePath = path.join(__dirname, 'logs-crisp-march-2025.txt');

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

  for (let i = 1; i <= totalPages; i++) {
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
    console.log('getting data');
    const { data } = await got(
      `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversations/${pageNumber}?filter_not_resolved=1&filter_unassigned=1&per_page=${pageSize}`,
      { ...options, responseType: 'json' },
    ).json();

    console.log(data.length);
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
        execSync('sleep 3');

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
      } catch (err) {
        console.log(`Error while sending message to ${sessionId}`);
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
  const message = `Bonjour,

Nous vous remercions pour votre message et nous excusons pour le délai de réponse, dû à un volume élevé de demandes.

Nous tenons à vous informer que le dispositif pass Sport 2024 est désormais clôturé depuis le 31 décembre 2024. Le dispositif 2025 ouvrira à partir du 1er juin 2025.

Pour les bénéficiaires :

Si votre club a enregistré votre pass Sport mais ne vous a pas encore remboursé les 50€ avancés, contactez-le directement pour régulariser la situation.

Pour les structures sportives :

Les remboursements sont en cours et se poursuivront jusqu'à mi-avril. Toutes les structures sportives seront remboursées d'ici cette date.

Nous avons contacté toutes les structures sportives concernées par une anomalie. Si vous êtes dans cette situation, sachez que votre dossier est en cours d’instruction. Nous vous remercions pour votre patience et votre compréhension pendant ce traitement.

Nous vous souhaitons une excellente journée.

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

function isValidConversation(conversation) {
  // Les filtres correspondants :
  // LSM => email = lsm.pass.sport@sports.gouv.fr
  // RGPD => email = ds-rgpd@sports.gouv.fr
  const meta = conversation.meta;
  const invalidSegments = [];
  const invalidEmails = [
    'lsm.pass.sport@sports.gouv.fr',
    'ds-rgpd@sports.gouv.fr',
    'djepva.disi@jeunesse-sports.gouv.fr',
  ];

  const hasValidSegment = !meta.segments.some((segment) =>
    invalidSegments.some((invalidSegment) => invalidSegment === segment),
  );

  const hasValidEmails = !invalidEmails.some((invalidEmail) => invalidEmail === meta.email);

  return hasValidSegment && hasValidEmails;
}

// Prior to executing the main script (main()), check the number of conversations from getConversations() manually
// Execute here main()
// await main(1);
// await getConversations({ pageNumber: 1, pageSize: 50 });
