import { z } from 'zod';
import got from 'got';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
const DEFAULT_TIMEOUT = 'sleep 1';
const SEGMENT_BOURSIER_TRAITE = 'boursier-traite-du-15-novembre-au-12-decembre';

function logError(sessionId, message) {
  const timestamp = new Date().toISOString(); // Timestamp for logging
  const logFilePath = path.join(__dirname, 'logs-crisp-december-2025.txt');

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

    execSync(DEFAULT_TIMEOUT);
    const conversations = await getConversations({ pageNumber: i, pageSize: 50 });
    execSync(DEFAULT_TIMEOUT);

    totalImpacted += await processConversations(conversations, logs);

    console.log(`batch ${i} processed.`);
  }

  console.log(`Total impacted ${totalImpacted}`);

  console.log('Writing logs...');
  fs.writeFileSync('./unresolve-boursiers-logs.txt', JSON.stringify(logs));
  console.log('Finished writing logs');
}

async function getConversations({ pageNumber, pageSize } = { pageNumber: 1, pageSize: 50 }) {
  try {
    const startDate = '2025-11-15T00:00:00.000Z';
    const endDate = '2025-12-12T00:00:00.000Z';
    const segment = 'boursier';

    // Retrieve resolved and unassigned conversations with segment boursiers, created between the 15th novembre 2025 and the 12th december 2025
    const { data } = await got(
      `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversations/${pageNumber}?filter_date_start=${startDate}&filter_date_end${endDate}=&filter_resolved=1&filter_unassigned=1&search_query=${segment}&search_type=segment&per_page=${pageSize}`,
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
    console.log({ conversation });

    console.log(`Processing message ${sessionId}`);

    try {
      const existingSegments = conversation?.meta?.segments ?? [];

      await updateSegments({ sessionId, existingSegments });

      execSync(DEFAULT_TIMEOUT);

      await unresolveConversation(sessionId);
    } catch (err) {
      console.log(`Error while unresolving message from ${sessionId}`, err);
      logError(sessionId, err);
      logs.push({
        sessionId,
        messageSent: true,
        err,
      });
    }

    count += 1;
  }

  return count;
}

async function unresolveConversation(sessionId) {
  // https://docs.crisp.chat/references/rest-api/v1/#change-conversation-state
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/state`,
    {
      ...options,
      method: 'PATCH',
      json: {
        state: 'unresolved',
      },
      responseType: 'json',
    },
  ).json();
}

async function updateSegments({ sessionId, existingSegments }) {
  console.debug(`Updating segments to add ${SEGMENT_BOURSIER_TRAITE} to ${sessionId}`);

  // https://docs.crisp.chat/references/rest-api/v1/#update-conversation-metas
  await got(
    `https://api.crisp.chat/v1/website/${envVars.CRISP_WEBSITE}/conversation/${sessionId}/meta`,
    {
      ...options,
      method: 'PATCH',
      json: {
        segments: [...existingSegments, SEGMENT_BOURSIER_TRAITE],
      },
      responseType: 'json',
    },
  ).json();

  console.debug(`Finished updating segments for ${sessionId}`);
}

// Prior to executing the main script (main()), check the number of conversations from getConversations() manually
// Execute here main()
// await main();
