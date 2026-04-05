// scripts/news-monitor.js
// Runs every 15 minutes via GitHub Actions.
// Fetches Pokemon TCG news from the last hour, classifies each item,
// posts BREAKING items to Discord immediately, queues MINOR items.
// Commits updated state files back to repo.

const path = require('path');
const fs = require('fs');
const { search } = require('./firecrawl');
const { classifyItem } = require('./classify');
const { postWebhook, buildBreakingEmbed } = require('./discord');
const { PRODUCTS } = require('./products');

const SEEN_URLS_PATH = path.join(__dirname, '..', 'state', 'seen-urls.json');
const MINOR_QUEUE_PATH = path.join(__dirname, '..', 'state', 'minor-queue.json');

function loadState(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveState(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Find the first product from the watchlist that is mentioned in the news item.
 * @param {{ title: string, description: string }} item
 * @returns {object|null}
 */
function matchProduct(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return PRODUCTS.find(p =>
    text.includes(p.name.toLowerCase().split(' ').slice(0, 2).join(' '))
  ) || null;
}

async function main() {
  console.log('[news-monitor] Starting run at', new Date().toISOString());

  // Fetch Pokemon TCG news from the last hour
  const QUERIES = [
    'pokemon tcg new release announced 2026',
    'pokemon tcg chase card revealed',
    'pokemon tcg sold out restock price spike',
  ];

  const allResults = [];
  for (const query of QUERIES) {
    const results = search(query, { limit: 10, tbs: 'qdr:h' });
    allResults.push(...results);
  }

  console.log(`[news-monitor] Fetched ${allResults.length} raw results`);

  // Deduplicate by URL
  const seen = new Set();
  const uniqueResults = allResults.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Load state
  const seenUrls = new Set(loadState(SEEN_URLS_PATH, []));
  const minorQueue = loadState(MINOR_QUEUE_PATH, []);

  const newItems = uniqueResults.filter(item => !seenUrls.has(item.url));
  console.log(`[news-monitor] ${newItems.length} new items after dedup`);

  if (newItems.length === 0) {
    console.log('[news-monitor] Nothing new. Exiting.');
    return;
  }

  let breakingCount = 0;
  let minorCount = 0;

  for (const item of newItems) {
    const classification = classifyItem(item);
    seenUrls.add(item.url);

    if (classification === 'BREAKING') {
      console.log(`[news-monitor] BREAKING: ${item.title}`);
      const matchedProduct = matchProduct(item);
      const payload = buildBreakingEmbed(item, matchedProduct);
      try {
        await postWebhook(payload);
        breakingCount++;
      } catch (err) {
        console.error('[news-monitor] Failed to post breaking alert:', err.message);
      }
    } else {
      console.log(`[news-monitor] MINOR: ${item.title}`);
      minorQueue.push({
        title: item.title,
        url: item.url,
        description: item.description || '',
        seenAt: new Date().toISOString(),
      });
      minorCount++;
    }
  }

  // Save updated state
  saveState(SEEN_URLS_PATH, [...seenUrls]);
  saveState(MINOR_QUEUE_PATH, minorQueue);

  console.log(`[news-monitor] Done. Breaking: ${breakingCount}, Minor queued: ${minorCount}`);
}

main().catch(err => {
  console.error('[news-monitor] Fatal error:', err);
  process.exit(1);
});
