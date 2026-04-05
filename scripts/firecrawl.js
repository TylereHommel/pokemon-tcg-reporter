// scripts/firecrawl.js
// Thin wrapper around the firecrawl CLI. All functions are synchronous
// (they shell out to the CLI and wait). Temp files are used for output
// to avoid flooding stdout.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Setup local temp directory for firecrawl output (avoids Windows path issues)
const TEMP_DIR = path.join(__dirname, '..', '.firecrawl', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function tmpPath(prefix) {
  return path.join(TEMP_DIR, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function toUnixPath(p) {
  return p.replace(/\\/g, '/');
}

function ensureAuth() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('FIRECRAWL_API_KEY env var is not set');
  // firecrawl-cli reads FIRECRAWL_API_KEY automatically
}

/**
 * Run a Firecrawl web search.
 * @param {string} query
 * @param {{ limit?: number, tbs?: string }} opts
 * @returns {{ url: string, title: string, description: string }[]}
 */
function search(query, opts = {}) {
  ensureAuth();
  const limit = opts.limit || 10;
  const tbs = opts.tbs ? `--tbs ${opts.tbs}` : '';
  const out = tmpPath('fc-search') + '.json';

  try {
    execSync(
      `firecrawl search ${JSON.stringify(query)} --limit ${limit} ${tbs} --json -o "${toUnixPath(out)}"`,
      { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] }
    );
    const raw = fs.readFileSync(out, 'utf8');
    const data = JSON.parse(raw);
    return data.data?.web || [];
  } catch (err) {
    console.error(`[firecrawl.search] failed for query "${query}":`, err.message);
    return [];
  } finally {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  }
}

/**
 * Scrape a single URL and return its markdown content.
 * @param {string} url
 * @returns {string}
 */
function scrape(url) {
  ensureAuth();
  const out = tmpPath('fc-scrape') + '.md';

  try {
    execSync(
      `firecrawl scrape ${JSON.stringify(url)} --only-main-content -o "${toUnixPath(out)}"`,
      { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] }
    );
    return fs.readFileSync(out, 'utf8');
  } catch (err) {
    console.error(`[firecrawl.scrape] failed for url "${url}":`, err.message);
    return '';
  } finally {
    if (fs.existsSync(out)) fs.unlinkSync(out);
  }
}

/**
 * Open a URL in a cloud browser session and return the scraped markdown.
 * Used for JS-rendered pages like eBay sold listings.
 * @param {string} url
 * @returns {string}
 */
function browserScrape(url) {
  ensureAuth();
  const out = tmpPath('fc-browser') + '.md';

  try {
    execSync(`firecrawl browser ${JSON.stringify(`open ${url}`)}`, {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    execSync(`firecrawl browser "wait 3"`, {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    execSync(`firecrawl browser "scrape --only-main-content" -o "${toUnixPath(out)}"`, {
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return fs.readFileSync(out, 'utf8');
  } catch (err) {
    console.error(`[firecrawl.browserScrape] failed for url "${url}":`, err.message);
    return '';
  } finally {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    // Close the browser session to avoid leaving it open
    try {
      execSync('firecrawl browser close', {
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    } catch (_) { /* ignore */ }
  }
}

module.exports = { search, scrape, browserScrape };
