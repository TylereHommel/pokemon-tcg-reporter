// scripts/daily-digest.js
// Runs daily at 6am PST via GitHub Actions.
// Reads the minor news queue, posts a digest to Discord, then clears the queue.

const path = require('path');
const fs = require('fs');
const { postWebhook, buildDigestEmbed } = require('./discord');

const MINOR_QUEUE_PATH = path.join(__dirname, '..', 'state', 'minor-queue.json');

function loadQueue() {
  try {
    return JSON.parse(fs.readFileSync(MINOR_QUEUE_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function main() {
  console.log('[daily-digest] Starting run at', new Date().toISOString());

  const queue = loadQueue();

  if (queue.length === 0) {
    console.log('[daily-digest] Queue is empty. No digest to post. Exiting.');
    return;
  }

  console.log(`[daily-digest] Posting digest with ${queue.length} items`);

  // Discord embed description has a 4096 char limit.
  // Cap at 20 items to stay well within limits.
  const items = queue.slice(0, 20);
  const payload = buildDigestEmbed(items);

  await postWebhook(payload);
  console.log('[daily-digest] Posted digest successfully');

  // Clear the queue
  fs.writeFileSync(MINOR_QUEUE_PATH, JSON.stringify([], null, 2));
  console.log('[daily-digest] Queue cleared');
}

main().catch(err => {
  console.error('[daily-digest] Fatal error:', err);
  process.exit(1);
});
