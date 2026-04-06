// scripts/rss.js
// Fetches and parses RSS feeds from Pokemon TCG news sources.
// Used by news-monitor.js as a free alternative to search APIs.
// No npm dependencies — uses Node's built-in https module.

const https = require('https');
const http = require('http');
const { URL } = require('url');

const FEEDS = [
  { url: 'https://www.pokebeach.com/feed',                    source: 'PokeBeach'     },
  { url: 'https://www.pokeguardian.com/feed',                 source: 'PokeGuardian'  },
  { url: 'https://www.reddit.com/r/PokemonTCG/new/.rss',     source: 'r/PokemonTCG'  },
  { url: 'https://www.reddit.com/r/PokeInvesting/new/.rss',  source: 'r/PokeInvesting' },
  { url: 'https://www.reddit.com/r/pkmntcg/new/.rss',        source: 'r/pkmntcg'     },
];

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PokemonTCGBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => resolve(out));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * Extract text content from an XML tag.
 * @param {string} xml
 * @param {string} tag
 */
function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

/**
 * Parse RSS/Atom XML and return items array.
 * @param {string} xml
 * @returns {{ title: string, url: string, description: string, pubDate: Date }[]}
 */
function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') || extractTag(block, 'guid');
    const description = extractTag(block, 'description');
    const pubDateStr = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated');
    const pubDate = pubDateStr ? new Date(pubDateStr) : new Date();

    if (title && link) {
      items.push({ title, url: link, description, pubDate });
    }
  }

  return items;
}

/**
 * Fetch all RSS feeds and return items published within the last N minutes.
 * @param {number} withinMinutes  How far back to look (default: 75 to overlap with 15-min cron)
 * @returns {Promise<{ title: string, url: string, description: string }[]>}
 */
async function fetchRecentItems(withinMinutes = 75) {
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
  const allItems = [];

  for (const feed of FEEDS) {
    try {
      const xml = await fetchUrl(feed.url);
      const items = parseRss(xml);
      const recent = items.filter(item => item.pubDate >= cutoff);
      console.log(`[rss] ${feed.source}: ${recent.length}/${items.length} items within ${withinMinutes}min`);
      for (const item of recent) {
        allItems.push({
          title: item.title,
          url: item.url,
          description: item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
        });
      }
    } catch (err) {
      console.error(`[rss] Failed to fetch ${feed.source}:`, err.message);
    }
  }

  return allItems;
}

module.exports = { fetchRecentItems };
