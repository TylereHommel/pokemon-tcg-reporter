// scripts/news-monitor.js
// Runs every 15 minutes via GitHub Actions.
// Fetches Pokemon TCG news from the last hour, classifies each item,
// posts BREAKING items to Discord immediately, queues MINOR items.
// Commits updated state files back to repo.

const path = require('path');
const fs = require('fs');
const { fetchRecentItems } = require('./rss');
const { scrape } = require('./apify');
const { classifyItem } = require('./classify');
const { postWebhook, buildBreakingEmbed, buildNewProductEmbed } = require('./discord');
const { getAllProducts } = require('./products');
const { detectProducts } = require('./product-detector');

const SEEN_URLS_PATH = path.join(__dirname, '..', 'state', 'seen-urls.json');
const MINOR_QUEUE_PATH = path.join(__dirname, '..', 'state', 'minor-queue.json');
const DYNAMIC_PRODUCTS_PATH = path.join(__dirname, '..', 'state', 'dynamic-products.json');

// Keywords that suggest a new sealed product is being announced
const NEW_PRODUCT_PATTERNS = [
  'new set announced', 'set announced', 'new expansion', 'expansion announced',
  'release date confirmed', 'new collection announced', 'new products revealed',
  'pokemon tcg announces', 'booster box announced', 'etb announced',
];

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
  const products = getAllProducts();
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return products.find(p =>
    text.includes(p.name.toLowerCase().split(' ').slice(0, 2).join(' '))
  ) || null;
}

/**
 * Load dynamic products state file.
 * @returns {object[]}
 */
function loadDynamicProducts() {
  try {
    return JSON.parse(fs.readFileSync(DYNAMIC_PRODUCTS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Check if a news item looks like a new sealed product announcement.
 * @param {{ title: string, description: string }} item
 * @returns {boolean}
 */
function isNewProductAnnouncement(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  return NEW_PRODUCT_PATTERNS.some(p => text.includes(p));
}

async function main() {
  console.log('[news-monitor] Starting run at', new Date().toISOString());

  // Fetch recent items from RSS feeds (free, no API credits)
  const allResults = await fetchRecentItems(75);
  console.log(`[news-monitor] Fetched ${allResults.length} raw results from RSS feeds`);

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
  const dynamicProducts = loadDynamicProducts();
  const existingNames = getAllProducts().map(p => p.name.toLowerCase());
  let dynamicUpdated = false;

  for (const item of newItems) {
    const classification = classifyItem(item);
    seenUrls.add(item.url);

    if (classification === 'BREAKING') {
      console.log(`[news-monitor] BREAKING: ${item.title}`);

      // Post the breaking news alert
      const matchedProduct = matchProduct(item);
      try {
        await postWebhook(buildBreakingEmbed(item, matchedProduct));
        breakingCount++;
      } catch (err) {
        console.error('[news-monitor] Failed to post breaking alert:', err.message);
      }

      // Check if this looks like a new product announcement — scrape and detect
      if (isNewProductAnnouncement(item)) {
        console.log(`[news-monitor] Scanning for new products in: ${item.url}`);
        const content = scrape(item.url);
        const detected = detectProducts(item.title, content, item.url, existingNames);

        for (const product of detected) {
          console.log(`[news-monitor] New product found: ${product.name}`);
          dynamicProducts.push(product);
          existingNames.push(product.name.toLowerCase());
          dynamicUpdated = true;

          try {
            await postWebhook(buildNewProductEmbed(product));
          } catch (err) {
            console.error('[news-monitor] Failed to post new product alert:', err.message);
          }
        }
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
  if (dynamicUpdated) {
    saveState(DYNAMIC_PRODUCTS_PATH, dynamicProducts);
    console.log(`[news-monitor] Saved ${dynamicProducts.length} dynamic products`);
  }

  console.log(`[news-monitor] Done. Breaking: ${breakingCount}, Minor queued: ${minorCount}`);
}

main().catch(err => {
  console.error('[news-monitor] Fatal error:', err);
  process.exit(1);
});
