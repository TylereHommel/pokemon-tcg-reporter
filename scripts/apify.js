// scripts/apify.js
// Replaces firecrawl.js. Uses Apify for web search (weekly report sentiment)
// and native Node https for static page scraping (PriceCharting, news articles).

const https = require('https');
const http = require('http');
const { URL } = require('url');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const SEARCH_ACTOR = 'apify~google-search-scraper';

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => resolve(out));
    }).on('error', reject);
  });
}

function httpPost(urlStr, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(urlStr);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(out)); } catch { resolve([]); }
        } else {
          reject(new Error(`Apify HTTP ${res.statusCode}: ${out.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Strip HTML tags to plain text ───────────────────────────────────────────

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search the web via Apify Google Search Scraper.
 * Returns [{title, url, description}] or [] on failure.
 * @param {string} query
 * @param {{ limit?: number, tbs?: string }} options
 */
async function search(query, { limit = 10, tbs } = {}) {
  if (!APIFY_TOKEN) {
    console.error('[apify.search] APIFY_API_TOKEN not set');
    return [];
  }

  const input = {
    queries: query,
    maxPagesPerQuery: 1,
    resultsPerPage: Math.min(limit, 10),
    languageCode: 'en',
    countryCode: 'us',
  };
  if (tbs) input.tbs = tbs;

  try {
    const url = `https://api.apify.com/v2/acts/${SEARCH_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120`;
    const results = await httpPost(url, input);
    return (Array.isArray(results) ? results : []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      description: r.description || r.snippet || '',
    }));
  } catch (err) {
    console.error(`[apify.search] failed for query "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch and strip a static web page to plain text.
 * Returns '' on failure.
 * @param {string} url
 */
async function scrape(url) {
  try {
    const html = await httpGet(url);
    return stripHtml(html);
  } catch (err) {
    console.error(`[apify.scrape] failed for url "${url}":`, err.message);
    return '';
  }
}

module.exports = { search, scrape };
