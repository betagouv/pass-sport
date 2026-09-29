// Date of implementation : 2026-09-25
// Adds a note and the SEGMENT segment to every Crisp conversation whose email matches one listed
// in a CSV file.
// Conversations already holding SEGMENT are skipped, so the script can be re-run.
// Usage:
//   CSV_INPUT=/path/to/emails.csv NOTE_CONTENT="Some note" npm run scripts:add-note-to-conversations
// The CSV must have an `email` column (`,` or `;` separated).
// Set DRY_RUN=1 to list matching conversations without adding notes.
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parse } from 'csv-parse/sync';
import { Crisp } from 'crisp-api';
import { z } from 'zod';

const PAGE_SIZE = 50;
const DELAY_MS = 250;
const SEGMENT = 'appel-qf-etait-inconcluant';

const env = z
  .object({
    CRISP_IDENTIFIER: z.string(),
    CRISP_KEY: z.string(),
    CRISP_WEBSITE: z.string(),
    CSV_INPUT: z.string(),
    NOTE_CONTENT: z.string().min(1),
    DRY_RUN: z.stringbool().default(false),
  })
  .parse(process.env);

const crisp = new Crisp();
crisp.authenticateTier('plugin', env.CRISP_IDENTIFIER, env.CRISP_KEY);

function readEmails(path) {
  const rows = parse(readFileSync(path), {
    columns: (header) => header.map((column) => column.trim().toLowerCase()),
    delimiter: [',', ';'],
    bom: true,
    skip_empty_lines: true,
    trim: true,
  });

  return [...new Set(rows.map((row) => row.email?.toLowerCase()).filter(Boolean))];
}

// Text search is fuzzy, so results are narrowed to an exact email match
async function findConversations(email) {
  const conversations = [];

  for (let page = 1; ; page++) {
    const results = await crisp.website.listConversations(env.CRISP_WEBSITE, page, {
      search_type: 'text',
      search_query: email,
      per_page: PAGE_SIZE,
    });

    conversations.push(
      ...results.filter((conversation) => conversation.meta?.email?.toLowerCase() === email),
    );

    if (results.length < PAGE_SIZE) {
      return conversations;
    }

    await sleep(DELAY_MS);
  }
}

async function addSegment(sessionId, existingSegments) {
  await crisp.website.updateConversationMetas(env.CRISP_WEBSITE, sessionId, {
    segments: [...existingSegments, SEGMENT],
  });
}

async function addNote(sessionId) {
  await crisp.website.sendMessageInConversation(env.CRISP_WEBSITE, sessionId, {
    type: 'note',
    from: 'operator',
    origin: 'chat',
    content: env.NOTE_CONTENT,
  });
}

async function main() {
  const emails = readEmails(env.CSV_INPUT);
  const report = { found: [], notFound: [], noted: [], skipped: [], errors: [] };

  console.log(`${emails.length} emails to process${env.DRY_RUN ? ' (dry run)' : ''}`);

  for (const [index, email] of emails.entries()) {
    try {
      const conversations = await findConversations(email);
      await sleep(DELAY_MS);

      if (conversations.length === 0) {
        console.log(`[${index + 1}/${emails.length}] ${email}: no conversation`);
        report.notFound.push(email);
        continue;
      }

      report.found.push({ email, conversations: conversations.length });

      for (const { session_id: sessionId, meta } of conversations) {
        const segments = meta?.segments ?? [];

        if (segments.includes(SEGMENT)) {
          console.log(
            `[${index + 1}/${emails.length}] ${email}: ${sessionId} already has ${SEGMENT}`,
          );
          report.skipped.push({ email, sessionId });
          continue;
        }

        if (!env.DRY_RUN) {
          await addNote(sessionId);
          await sleep(DELAY_MS);
          await addSegment(sessionId, segments);
          await sleep(DELAY_MS);
        }

        console.log(`[${index + 1}/${emails.length}] ${email}: note added to ${sessionId}`);
        report.noted.push({ email, sessionId });
      }
    } catch (error) {
      console.error(`[${index + 1}/${emails.length}] ${email}: error`, error);
      report.errors.push({ email, error: error?.message ?? String(error) });
    }
  }

  const conversationsFound = report.found.reduce(
    (total, { conversations }) => total + conversations,
    0,
  );

  const summary = {
    'Emails in CSV': emails.length,
    'Emails with at least one conversation': report.found.length,
    'Emails without conversation': report.notFound.length,
    'Emails in error': report.errors.length,
    'Conversations found': conversationsFound,
    [`Conversations ${env.DRY_RUN ? 'to tag' : 'tagged'} (note + segment)`]: report.noted.length,
    'Conversations already tagged': report.skipped.length,
  };

  console.log(`\n===== Summary${env.DRY_RUN ? ' (dry run, nothing written)' : ''} =====`);
  for (const [label, count] of Object.entries(summary)) {
    console.log(`${label.padEnd(45)} ${count}`);
  }

  if (report.errors.length > 0) {
    console.log('Errors:', JSON.stringify(report.errors, null, 2));
  }
}

await main();
