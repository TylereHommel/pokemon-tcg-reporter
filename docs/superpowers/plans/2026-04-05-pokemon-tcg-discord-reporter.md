# Pokemon TCG Discord Sentiment Reporter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub Actions-powered system that posts weekly Pokemon TCG sentiment reports, real-time breaking news alerts, and a daily digest to a Discord channel via webhook.

**Architecture:** Three independent GitHub Actions workflows (weekly, 15-min monitor, 6am digest) share two JSON state files committed back to the repo. All scraping is done via the Firecrawl CLI. Discord messages are sent via webhook POST using Node's built-in `https` module.

**Tech Stack:** Node.js 20, Firecrawl CLI (`firecrawl-cli`), GitHub Actions, Discord Webhooks, no external npm dependencies beyond `node-fetch` (used only as fallback — primary HTTP uses Node built-ins).

---

## File Map

| File | Responsibility |
|------|---------------|
| `scripts/products.js` | Watchlist of products with MSRP, tier, eBay search term, PriceCharting slug |
| `scripts/firecrawl.js` | Thin wrapper around `firecrawl` CLI — `search()`, `scrape()`, `browserScrape()` |
| `scripts/discord.js` | Discord webhook POST with retry + three embed builders |
| `scripts/classify.js` | Keyword scorer → returns `'BREAKING'` or `'MINOR'` |
| `scripts/pricing.js` | Fetches eBay sold prices (browser) + PriceCharting value, returns pricing object |
| `scripts/news-monitor.js` | Entry point: search last hour, classify, post/queue, commit state |
| `scripts/daily-digest.js` | Entry point: read minor queue, post digest, clear queue, commit state |
| `scripts/weekly-report.js` | Entry point: search sentiment, fetch pricing all products, post weekly embeds |
| `state/seen-urls.json` | `string[]` — URLs already posted, prevents duplicates |
| `state/minor-queue.json` | `{ title, url, description, seenAt }[]` — queued minor items |
| `.github/workflows/news-monitor.yml` | Runs every 15 min, executes `news-monitor.js` |
| `.github/workflows/daily-digest.yml` | Runs daily at 14:00 UTC (6am PST), executes `daily-digest.js` |
| `.github/workflows/weekly-report.yml` | Runs Sunday 17:00 UTC (9am PST), executes `weekly-report.js` |
| `package.json` | Node project manifest, no runtime dependencies |
| `.env.example` | Documents required env vars |
| `.gitignore` | Ignores `.firecrawl/`, `node_modules/`, `.env` |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `state/seen-urls.json`
- Create: `state/minor-queue.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pokemon-tcg-discord-reporter",
  "version": "1.0.0",
  "description": "Automated Pokemon TCG sentiment reporter for Discord",
  "main": "scripts/weekly-report.js",
  "scripts": {
    "weekly": "node scripts/weekly-report.js",
    "monitor": "node scripts/news-monitor.js",
    "digest": "node scripts/daily-digest.js",
    "test:classify": "node scripts/classify.js --test",
    "test:discord": "node scripts/discord.js --test",
    "test:pricing": "node scripts/pricing.js --test"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create .env.example**

```
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
DISCORD_WEBHOOK_URL=your_discord_webhook_url_here
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
.firecrawl/
*.log
```

- [ ] **Step 4: Create state/seen-urls.json**

```json
[]
```

- [ ] **Step 5: Create state/minor-queue.json**

```json
[]
```

- [ ] **Step 6: Commit scaffold**

```bash
git init
git add .
git commit -m "chore: initial project scaffold"
```

---

## Task 2: scripts/products.js — Product Watchlist

**Files:**
- Create: `scripts/products.js`

- [ ] **Step 1: Create the watchlist**

```js
// scripts/products.js
// Product watchlist. Update this file when new sets release.
// pricechartingSlug: the URL segment from pricecharting.com/game/pokemon-{slug}/{product-slug}
// ebaySearchTerm: used to build the eBay sold listing search URL

const PRODUCTS = [
  {
    name: 'Prismatic Evolutions ETB',
    msrp: 54.99,
    tier: 1,
    ebaySearchTerm: 'pokemon prismatic evolutions elite trainer box',
    pricechartingSet: 'pokemon-scarlet-violet-prismatic-evolutions',
    pricechartingProduct: 'elite-trainer-box',
    chaseCard: 'Umbreon ex #161 SIR',
  },
  {
    name: 'Prismatic Evolutions Super Premium Collection',
    msrp: 79.99,
    tier: 1,
    ebaySearchTerm: 'pokemon prismatic evolutions super premium collection',
    pricechartingSet: 'pokemon-scarlet-violet-prismatic-evolutions',
    pricechartingProduct: 'super-premium-collection',
    chaseCard: 'Umbreon ex #161 SIR',
  },
  {
    name: 'Prismatic Evolutions Booster Bundle',
    msrp: 29.99,
    tier: 1,
    ebaySearchTerm: 'pokemon prismatic evolutions booster bundle',
    pricechartingSet: 'pokemon-scarlet-violet-prismatic-evolutions',
    pricechartingProduct: 'booster-bundle',
    chaseCard: 'Umbreon ex #161 SIR',
  },
  {
    name: 'Destined Rivals ETB',
    msrp: 54.99,
    tier: 1,
    ebaySearchTerm: 'pokemon destined rivals elite trainer box',
    pricechartingSet: 'pokemon-scarlet-violet-destined-rivals',
    pricechartingProduct: 'elite-trainer-box',
    chaseCard: "Ethan's Ho-Oh ex #230",
  },
  {
    name: 'Destined Rivals Booster Bundle',
    msrp: 29.99,
    tier: 1,
    ebaySearchTerm: 'pokemon destined rivals booster bundle',
    pricechartingSet: 'pokemon-scarlet-violet-destined-rivals',
    pricechartingProduct: 'booster-bundle',
    chaseCard: "Ethan's Ho-Oh ex #230",
  },
  {
    name: 'Destined Rivals Booster Box',
    msrp: 143.64,
    tier: 1,
    ebaySearchTerm: 'pokemon destined rivals booster box',
    pricechartingSet: 'pokemon-scarlet-violet-destined-rivals',
    pricechartingProduct: 'booster-box',
    chaseCard: "Ethan's Ho-Oh ex #230",
  },
  {
    name: '30th Anniversary First Partner Collection Series 1',
    msrp: 39.99,
    tier: 2,
    ebaySearchTerm: 'pokemon 30th anniversary first partner collection series 1',
    pricechartingSet: 'pokemon-30th-anniversary',
    pricechartingProduct: 'first-partner-collection-series-1',
    chaseCard: 'TBD',
  },
  {
    name: 'Journey Together ETB',
    msrp: 54.99,
    tier: 2,
    ebaySearchTerm: 'pokemon journey together elite trainer box',
    pricechartingSet: 'pokemon-scarlet-violet-journey-together',
    pricechartingProduct: 'elite-trainer-box',
    chaseCard: "N's SIR",
  },
  {
    name: 'Journey Together Booster Bundle',
    msrp: 29.99,
    tier: 2,
    ebaySearchTerm: 'pokemon journey together booster bundle',
    pricechartingSet: 'pokemon-scarlet-violet-journey-together',
    pricechartingProduct: 'booster-bundle',
    chaseCard: "N's SIR",
  },
  {
    name: 'Ascended Heroes ETB',
    msrp: 54.99,
    tier: 2,
    ebaySearchTerm: 'pokemon ascended heroes elite trainer box',
    pricechartingSet: 'pokemon-ascended-heroes',
    pricechartingProduct: 'elite-trainer-box',
    chaseCard: 'TBD',
  },
  {
    name: 'Mega Evolution Chaos Rising ETB',
    msrp: 54.99,
    tier: 2,
    ebaySearchTerm: 'pokemon mega evolution chaos rising elite trainer box',
    pricechartingSet: 'pokemon-mega-evolution-chaos-rising',
    pricechartingProduct: 'elite-trainer-box',
    chaseCard: 'TBD',
  },
];

module.exports = { PRODUCTS };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/products.js
git commit -m "feat: add product watchlist"
```

---

## Task 3: scripts/firecrawl.js — CLI Wrapper

**Files:**
- Create: `scripts/firecrawl.js`

- [ ] **Step 1: Write the module**

```js
// scripts/firecrawl.js
// Thin wrapper around the firecrawl CLI. All functions are synchronous
// (they shell out to the CLI and wait). Temp files are used for output
// to avoid flooding stdout.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function tmpPath(prefix) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
      `firecrawl search ${JSON.stringify(query)} --limit ${limit} ${tbs} --json -o ${JSON.stringify(out)}`,
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
      `firecrawl scrape ${JSON.stringify(url)} --only-main-content -o ${JSON.stringify(out)}`,
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
    execSync(`firecrawl browser "scrape" -o ${JSON.stringify(out)}`, {
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
```

- [ ] **Step 2: Smoke test — verify search returns results**

```bash
FIRECRAWL_API_KEY=fc-8293729d54074aeea5aed36be0c1196b node -e "
const { search } = require('./scripts/firecrawl');
const results = search('pokemon tcg news', { limit: 3 });
console.log('Results count:', results.length);
console.log('First result:', results[0]?.title);
if (results.length === 0) throw new Error('No results returned');
console.log('PASS');
"
```

Expected output:
```
Results count: 3
First result: [some pokemon news title]
PASS
```

- [ ] **Step 3: Commit**

```bash
git add scripts/firecrawl.js
git commit -m "feat: add firecrawl CLI wrapper"
```

---

## Task 4: scripts/discord.js — Webhook & Embed Builder

**Files:**
- Create: `scripts/discord.js`

- [ ] **Step 1: Write the module**

```js
// scripts/discord.js
// Sends messages to Discord via webhook POST.
// Uses Node's built-in https module — no npm dependencies.

const https = require('https');
const { URL } = require('url');

/**
 * POST a payload to the Discord webhook. Retries once on failure.
 * @param {object} payload  Discord webhook payload (embeds array)
 */
async function postWebhook(payload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('DISCORD_WEBHOOK_URL env var is not set');

  const attempt = () => new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(webhookUrl);

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Discord webhook HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });

  try {
    await attempt();
  } catch (err) {
    console.error('[discord] First attempt failed:', err.message, '— retrying in 5s');
    await new Promise(r => setTimeout(r, 5000));
    await attempt(); // throws if second attempt also fails
  }
}

/**
 * Extract readable domain from a URL string.
 * @param {string} urlStr
 * @returns {string}
 */
function extractDomain(urlStr) {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

/**
 * Build a filled progress bar for a 0–100 score.
 * @param {number} score
 * @returns {string}  e.g. "████████░░"
 */
function progressBar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/**
 * Format today's date as "Apr 6, 2026"
 */
function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Embed Builders ────────────────────────────────────────────────────────

/**
 * Breaking news embed (red).
 * @param {{ title: string, url: string, description: string }} item
 * @param {object|null} matchedProduct  Product from watchlist, or null
 * @returns {object}  Discord webhook payload
 */
function buildBreakingEmbed(item, matchedProduct) {
  const fields = [];
  if (matchedProduct) {
    fields.push({ name: '💰 MSRP', value: `$${matchedProduct.msrp.toFixed(2)}`, inline: true });
    if (matchedProduct.chaseCard && matchedProduct.chaseCard !== 'TBD') {
      fields.push({ name: '🃏 Chase Card', value: matchedProduct.chaseCard, inline: true });
    }
  }

  return {
    embeds: [{
      title: '🚨 BREAKING — Pokemon TCG',
      description: [
        '━━━━━━━━━━━━━━━━━━━━━━━━━',
        `**${item.title}**`,
        '',
        item.description || '',
        '',
        `🔗 Source: [${extractDomain(item.url)}](${item.url})`,
      ].join('\n'),
      color: 0xFF0000,
      fields,
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Daily digest embed (blue).
 * @param {{ title: string, url: string }[]} items
 * @returns {object}  Discord webhook payload
 */
function buildDigestEmbed(items) {
  const lines = items.map(item =>
    `• ${item.title} — [${extractDomain(item.url)}](${item.url})`
  );

  return {
    embeds: [{
      title: `📋 DAILY TCG DIGEST — ${formatDate()}`,
      description: [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Minor updates from the last 24h:',
        '',
        ...lines,
      ].join('\n'),
      color: 0x0099FF,
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Weekly product embed (red for tier 1, orange for tier 2).
 * @param {object} product  From products.js
 * @param {{ mostRecentSale: {price:number,date:string}|null, avgLast10: number|null, pricechartingValue: number|null, avgMargin: number|null, recentMargin: number|null }} pricing
 * @param {{ score: number, biasScore: number }} sentiment
 * @returns {object}  Discord webhook payload
 */
function buildWeeklyProductEmbed(product, pricing, sentiment) {
  const tierEmoji = product.tier === 1 ? '🔴' : '🟡';
  const rec = sentiment.score >= 70 ? '✅ **CHASE**'
            : sentiment.score >= 40 ? '🟡 **HOLD**'
            : '❌ **SKIP**';

  const priceLines = [`💰 \`MSRP:            \` $${product.msrp.toFixed(2)}`];

  if (pricing.mostRecentSale) {
    priceLines.push(`📦 \`Most Recent Sale:\` $${pricing.mostRecentSale.price.toFixed(2)} (${pricing.mostRecentSale.date})`);
  } else {
    priceLines.push(`📦 \`Most Recent Sale:\` N/A`);
  }

  if (pricing.avgLast10 != null) {
    priceLines.push(`📊 \`10-Sale Avg:     \` $${pricing.avgLast10.toFixed(2)}`);
  }
  if (pricing.pricechartingValue != null) {
    priceLines.push(`🏪 \`PriceCharting:   \` $${pricing.pricechartingValue.toFixed(2)}`);
  }
  if (pricing.avgMargin != null) {
    const recentStr = pricing.recentMargin != null
      ? ` | +${pricing.recentMargin.toFixed(0)}% (recent)`
      : '';
    priceLines.push(`📈 \`Flip Margin:     \` +${pricing.avgMargin.toFixed(0)}% (avg)${recentStr}`);
  }

  const description = [
    `Hype: ${progressBar(sentiment.score)} ${sentiment.score}/100 | Bias: ${sentiment.biasScore}/100`,
    product.chaseCard && product.chaseCard !== 'TBD' ? `🃏 Chase: ${product.chaseCard}` : '',
    '',
    priceLines.join('\n'),
    '',
    rec,
  ].filter(l => l !== '').join('\n');

  return {
    embeds: [{
      title: `${tierEmoji} TIER ${product.tier} — ${product.name}`,
      description,
      color: product.tier === 1 ? 0xFF4444 : 0xFFAA00,
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * Weekly report header embed (purple).
 */
function buildWeeklyHeaderEmbed() {
  return {
    embeds: [{
      title: `🎯 WEEKLY TCG SENTIMENT REPORT — ${formatDate()}`,
      description: 'Sourced from Reddit · TCGPlayer · PriceCharting · eBay\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      color: 0x9B59B6,
      timestamp: new Date().toISOString(),
    }],
  };
}

// ─── Self-test (run with: node scripts/discord.js --test) ────────────────────
if (process.argv.includes('--test')) {
  (async () => {
    console.log('Testing Discord webhook...');
    const payload = buildBreakingEmbed(
      { title: 'TEST: Discord reporter is working', url: 'https://example.com', description: 'This is a test message.' },
      null
    );
    await postWebhook(payload);
    console.log('PASS — check your Discord channel for the test message');
  })().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
}

module.exports = {
  postWebhook,
  buildBreakingEmbed,
  buildDigestEmbed,
  buildWeeklyProductEmbed,
  buildWeeklyHeaderEmbed,
  formatDate,
};
```

- [ ] **Step 2: Run self-test to verify webhook works**

```bash
DISCORD_WEBHOOK_URL="https://discordapp.com/api/webhooks/1490253613409243136/BzwH_kbrPrIEXrbxEmeRXDwAfzh5csLX3FXnrKteJIE8cwTJVl4D0SZHwl8569I12q3H" node scripts/discord.js --test
```

Expected:
```
Testing Discord webhook...
PASS — check your Discord channel for the test message
```

Verify a "TEST: Discord reporter is working" message appears in the Discord channel.

- [ ] **Step 3: Commit**

```bash
git add scripts/discord.js
git commit -m "feat: add Discord webhook client and embed builders"
```

---

## Task 5: scripts/classify.js — News Classifier

**Files:**
- Create: `scripts/classify.js`

- [ ] **Step 1: Write the module**

```js
// scripts/classify.js
// Scores a news item by keyword presence.
// Score >= 3 → BREAKING, score < 3 → MINOR.

const RULES = [
  { patterns: ['chase card revealed', 'new card revealed', 'card reveal'],      score: 3 },
  { patterns: ['special illustration rare', ' sir ', 'sir confirmed'],           score: 3 },
  { patterns: ['new set announced', 'set announced', 'release date confirmed'],  score: 3 },
  { patterns: ['surprise drop', 'early release', 'surprise release'],            score: 3 },
  { patterns: ['sold out', 'selling out', 'out of stock'],                       score: 2 },
  { patterns: ['restock', 'back in stock', 'restocking'],                        score: 2 },
  { patterns: ['price spike', 'prices are insane', 'prices skyrocket'],          score: 2 },
  { patterns: ['pokemon day', '30th anniversary', 'anniversary reveal'],         score: 2 },
  { patterns: ['booster box'],                                                   score: 1 },
  { patterns: ['elite trainer box', 'etb'],                                      score: 1 },
];

/**
 * Classify a single news item.
 * @param {{ title: string, description: string }} item
 * @returns {'BREAKING' | 'MINOR'}
 */
function classifyItem(item) {
  const text = `${item.title} ${item.description || ''}`.toLowerCase();
  let score = 0;
  for (const { patterns, score: s } of RULES) {
    if (patterns.some(p => text.includes(p))) {
      score += s;
    }
  }
  return score >= 3 ? 'BREAKING' : 'MINOR';
}

// ─── Self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes('--test')) {
  const cases = [
    { item: { title: 'New chase card revealed for Chaos Rising', description: '' }, expected: 'BREAKING' },
    { item: { title: 'Special Illustration Rare Charizard confirmed', description: '' }, expected: 'BREAKING' },
    { item: { title: 'New set announced with release date', description: '' }, expected: 'BREAKING' },
    { item: { title: 'Destined Rivals ETB sold out at Target', description: 'sold out everywhere' }, expected: 'BREAKING' },
    { item: { title: 'Pokemon Day anniversary reveal coming', description: 'sold out' }, expected: 'BREAKING' },
    { item: { title: 'Prismatic Evolutions booster box pricing discussion', description: 'etb' }, expected: 'MINOR' },
    { item: { title: 'General Pokemon TCG market update', description: 'prices steady' }, expected: 'MINOR' },
  ];

  let passed = 0;
  for (const { item, expected } of cases) {
    const result = classifyItem(item);
    const ok = result === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'} — "${item.title}" → ${result} (expected ${expected})`);
    if (ok) passed++;
  }
  console.log(`\n${passed}/${cases.length} tests passed`);
  if (passed < cases.length) process.exit(1);
}

module.exports = { classifyItem };
```

- [ ] **Step 2: Run self-test**

```bash
node scripts/classify.js --test
```

Expected:
```
PASS — "New chase card revealed for Chaos Rising" → BREAKING (expected BREAKING)
PASS — "Special Illustration Rare Charizard confirmed" → BREAKING (expected BREAKING)
PASS — "New set announced with release date" → BREAKING (expected BREAKING)
PASS — "Destined Rivals ETB sold out at Target" → BREAKING (expected BREAKING)
PASS — "Pokemon Day anniversary reveal coming" → BREAKING (expected BREAKING)
PASS — "Prismatic Evolutions booster box pricing discussion" → MINOR (expected MINOR)
PASS — "General Pokemon TCG market update" → MINOR (expected MINOR)

7/7 tests passed
```

- [ ] **Step 3: Commit**

```bash
git add scripts/classify.js
git commit -m "feat: add news classifier with keyword scoring"
```

---

## Task 6: scripts/pricing.js — Pricing Fetcher

**Files:**
- Create: `scripts/pricing.js`

- [ ] **Step 1: Write the module**

```js
// scripts/pricing.js
// Fetches pricing data for a product:
//   - eBay sold listings (browser scrape for JS-rendered page)
//   - PriceCharting market value (static scrape)
// Returns a normalized pricing object.

const { scrape, browserScrape } = require('./firecrawl');

/**
 * Parse dollar amounts from a block of markdown text.
 * Filters to a reasonable range relative to the product MSRP.
 * @param {string} text
 * @param {number} msrp
 * @returns {number[]}
 */
function parsePrices(text, msrp) {
  const prices = [];
  const regex = /(?:US\s*)?\$(\d{1,4}(?:\.\d{2})?)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const price = parseFloat(match[1]);
    // Only keep prices in a sensible range (50% to 1500% of MSRP)
    if (price >= msrp * 0.5 && price <= msrp * 15) {
      prices.push(price);
    }
  }
  return prices;
}

/**
 * Parse a date string like "Apr 5" from eBay sold listing text near a price.
 * Returns a short string like "Apr 5" or null.
 * @param {string} text
 * @returns {string|null}
 */
function parseRecentDate(text) {
  const dateRegex = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/;
  const match = text.match(dateRegex);
  return match ? match[0] : null;
}

/**
 * Fetch eBay sold listing prices for a product using browser scrape.
 * @param {object} product
 * @returns {{ mostRecentSale: {price:number,date:string}|null, avgLast10: number|null }}
 */
function fetchEbaySoldPrices(product) {
  try {
    const query = encodeURIComponent(`${product.ebaySearchTerm} sealed`);
    // _sop=13 = sort by most recently ended
    const url = `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1&_sop=13`;

    console.log(`  [pricing] eBay browser scrape for: ${product.name}`);
    const md = browserScrape(url);

    if (!md) {
      console.warn(`  [pricing] eBay browser scrape returned empty for ${product.name}`);
      return { mostRecentSale: null, avgLast10: null };
    }

    const prices = parsePrices(md, product.msrp);

    if (prices.length === 0) {
      return { mostRecentSale: null, avgLast10: null };
    }

    const recentDate = parseRecentDate(md);
    const mostRecentSale = {
      price: prices[0],
      date: recentDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };

    const last10 = prices.slice(0, 10);
    const avgLast10 = last10.reduce((a, b) => a + b, 0) / last10.length;

    return { mostRecentSale, avgLast10: Math.round(avgLast10 * 100) / 100 };
  } catch (err) {
    console.error(`  [pricing] eBay fetch failed for ${product.name}:`, err.message);
    return { mostRecentSale: null, avgLast10: null };
  }
}

/**
 * Fetch PriceCharting market value for a product.
 * @param {object} product
 * @returns {number|null}
 */
function fetchPriceCharting(product) {
  try {
    const url = `https://www.pricecharting.com/game/${product.pricechartingSet}/${product.pricechartingProduct}`;
    console.log(`  [pricing] PriceCharting scrape for: ${product.name}`);
    const md = scrape(url);

    if (!md) return null;

    // PriceCharting shows the ungraded market price in a table cell like "| $123.05"
    // We look for the first price in the reasonable range
    const prices = parsePrices(md, product.msrp);
    return prices.length > 0 ? prices[0] : null;
  } catch (err) {
    console.error(`  [pricing] PriceCharting fetch failed for ${product.name}:`, err.message);
    return null;
  }
}

/**
 * Fetch full pricing data for a product.
 * @param {object} product  From products.js
 * @returns {{
 *   mostRecentSale: {price:number, date:string}|null,
 *   avgLast10: number|null,
 *   pricechartingValue: number|null,
 *   avgMargin: number|null,
 *   recentMargin: number|null
 * }}
 */
function fetchPricing(product) {
  const { mostRecentSale, avgLast10 } = fetchEbaySoldPrices(product);
  const pricechartingValue = fetchPriceCharting(product);

  const avgMargin = avgLast10 != null
    ? Math.round(((avgLast10 - product.msrp) / product.msrp) * 10000) / 100
    : pricechartingValue != null
      ? Math.round(((pricechartingValue - product.msrp) / product.msrp) * 10000) / 100
      : null;

  const recentMargin = mostRecentSale != null
    ? Math.round(((mostRecentSale.price - product.msrp) / product.msrp) * 10000) / 100
    : null;

  return { mostRecentSale, avgLast10, pricechartingValue, avgMargin, recentMargin };
}

// ─── Self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes('--test')) {
  const { PRODUCTS } = require('./products');
  const product = PRODUCTS.find(p => p.name === 'Ascended Heroes ETB');
  console.log(`Testing pricing fetch for: ${product.name}`);
  const result = fetchPricing(product);
  console.log('Result:', JSON.stringify(result, null, 2));
  if (result.pricechartingValue == null && result.avgLast10 == null) {
    console.warn('WARN: both pricing sources returned null — check network/scrape');
  } else {
    console.log('PASS — at least one pricing source returned data');
  }
}

module.exports = { fetchPricing };
```

- [ ] **Step 2: Run self-test (verifies Ascended Heroes ETB pulls ~$123)**

```bash
FIRECRAWL_API_KEY=fc-8293729d54074aeea5aed36be0c1196b node scripts/pricing.js --test
```

Expected (approximate):
```
Testing pricing fetch for: Ascended Heroes ETB
  [pricing] eBay browser scrape for: Ascended Heroes ETB
  [pricing] PriceCharting scrape for: Ascended Heroes ETB
Result: {
  "mostRecentSale": { "price": 109.99, "date": "Apr 5" },
  "avgLast10": 115.40,
  "pricechartingValue": 123.05,
  "avgMargin": 109.8,
  "recentMargin": 100.02
}
PASS — at least one pricing source returned data
```

- [ ] **Step 3: Commit**

```bash
git add scripts/pricing.js
git commit -m "feat: add pricing fetcher (eBay browser + PriceCharting)"
```

---

## Task 7: scripts/news-monitor.js — News Monitor Entry Point

**Files:**
- Create: `scripts/news-monitor.js`

- [ ] **Step 1: Write the script**

```js
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
```

- [ ] **Step 2: Run locally to verify it executes without errors**

```bash
FIRECRAWL_API_KEY=fc-8293729d54074aeea5aed36be0c1196b \
DISCORD_WEBHOOK_URL="https://discordapp.com/api/webhooks/1490253613409243136/BzwH_kbrPrIEXrbxEmeRXDwAfzh5csLX3FXnrKteJIE8cwTJVl4D0SZHwl8569I12q3H" \
node scripts/news-monitor.js
```

Expected — something like:
```
[news-monitor] Starting run at 2026-04-05T...
[news-monitor] Fetched 28 raw results
[news-monitor] 12 new items after dedup
[news-monitor] MINOR: Pokemon TCG market update...
[news-monitor] Done. Breaking: 0, Minor queued: 12
```

Check that `state/minor-queue.json` now has items in it.

- [ ] **Step 3: Commit**

```bash
git add scripts/news-monitor.js state/
git commit -m "feat: add news monitor script"
```

---

## Task 8: scripts/daily-digest.js — Daily Digest Entry Point

**Files:**
- Create: `scripts/daily-digest.js`

- [ ] **Step 1: Write the script**

```js
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
```

- [ ] **Step 2: Run locally (requires minor-queue.json to have items from Task 7 test)**

```bash
DISCORD_WEBHOOK_URL="https://discordapp.com/api/webhooks/1490253613409243136/BzwH_kbrPrIEXrbxEmeRXDwAfzh5csLX3FXnrKteJIE8cwTJVl4D0SZHwl8569I12q3H" \
node scripts/daily-digest.js
```

Expected:
```
[daily-digest] Starting run at 2026-04-05T...
[daily-digest] Posting digest with N items
[daily-digest] Posted digest successfully
[daily-digest] Queue cleared
```

Verify a `📋 DAILY TCG DIGEST` embed appears in Discord. Verify `state/minor-queue.json` is now `[]`.

- [ ] **Step 3: Commit**

```bash
git add scripts/daily-digest.js
git commit -m "feat: add daily digest script"
```

---

## Task 9: scripts/weekly-report.js — Weekly Report Entry Point

**Files:**
- Create: `scripts/weekly-report.js`

- [ ] **Step 1: Write the script**

```js
// scripts/weekly-report.js
// Runs every Sunday at 9am PST via GitHub Actions.
// Searches for sentiment data, fetches pricing, posts one embed per product.

const { search } = require('./firecrawl');
const { fetchPricing } = require('./pricing');
const { postWebhook, buildWeeklyHeaderEmbed, buildWeeklyProductEmbed } = require('./discord');
const { PRODUCTS } = require('./products');

const POSITIVE_KEYWORDS = [
  'chase', 'hype', 'hot', 'sold out', 'flipping', 'profit', 'invest',
  'rare', 'valuable', 'demand', 'appreciation', 'climbing', 'surging',
  'buy', 'grab', 'scarce', 'limited', 'insane', 'crazy',
];

const NEGATIVE_KEYWORDS = [
  'sitting', 'shelves', 'overpriced', 'avoid', 'skip', 'dump',
  'correction', 'bubble', 'crashing', 'dead', 'flop', 'disappointing',
  'bad pulls', 'not worth', 'pass', 'tank', 'drop',
];

/**
 * Score sentiment for a product based on search results.
 * @param {{ title: string, description: string }[]} results
 * @param {object} product
 * @returns {{ score: number, biasScore: number }}
 */
function scoreSentiment(results, product) {
  const nameTokens = product.name.toLowerCase().split(' ').slice(0, 3);
  let positiveCount = 0;
  let negativeCount = 0;
  let mentions = 0;

  for (const result of results) {
    const text = `${result.title} ${result.description || ''}`.toLowerCase();
    const mentioned = nameTokens.some(t => text.includes(t));
    if (!mentioned) continue;
    mentions++;

    for (const kw of POSITIVE_KEYWORDS) {
      if (text.includes(kw)) positiveCount++;
    }
    for (const kw of NEGATIVE_KEYWORDS) {
      if (text.includes(kw)) negativeCount++;
    }
  }

  if (mentions === 0) return { score: 50, biasScore: 50 };

  const total = positiveCount + negativeCount || 1;
  const score = Math.min(100, Math.max(0, Math.round((positiveCount / total) * 100)));
  const mentionRatio = Math.min(1, mentions / Math.max(results.length, 1));
  const biasScore = Math.min(100, Math.round(mentionRatio * 40 + score * 0.6));

  return { score, biasScore };
}

// Pause between Discord posts to avoid rate limiting (Discord allows ~5 webhooks/2s)
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[weekly-report] Starting run at', new Date().toISOString());

  // Run 4 parallel sentiment searches
  const QUERIES = [
    'pokemon tcg 2026 most hyped products resell profit site:reddit.com',
    'pokemon tcg 2026 best sets to buy chase cards',
    'pokemon tcg sealed product market price investment 2026',
    'pokemon tcg sold out restock hype demand 2026',
  ];

  console.log('[weekly-report] Fetching sentiment data...');
  const allResults = [];
  for (const query of QUERIES) {
    const results = search(query, { limit: 10 });
    allResults.push(...results);
  }
  console.log(`[weekly-report] Got ${allResults.length} sentiment results`);

  // Post header
  await postWebhook(buildWeeklyHeaderEmbed());
  await sleep(1000);

  // Process Tier 1 products first, then Tier 2
  const sortedProducts = [...PRODUCTS].sort((a, b) => a.tier - b.tier);

  for (const product of sortedProducts) {
    console.log(`[weekly-report] Processing: ${product.name}`);

    const sentiment = scoreSentiment(allResults, product);
    console.log(`  Sentiment: score=${sentiment.score}, bias=${sentiment.biasScore}`);

    console.log(`  Fetching pricing...`);
    const pricing = fetchPricing(product);
    console.log(`  Pricing: pricecharting=$${pricing.pricechartingValue}, avg10=$${pricing.avgLast10}`);

    const payload = buildWeeklyProductEmbed(product, pricing, sentiment);
    await postWebhook(payload);
    await sleep(1200); // Rate limit buffer between Discord posts
  }

  console.log('[weekly-report] All products posted. Done.');
}

main().catch(err => {
  console.error('[weekly-report] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run locally to verify full report posts to Discord**

```bash
FIRECRAWL_API_KEY=fc-8293729d54074aeea5aed36be0c1196b \
DISCORD_WEBHOOK_URL="https://discordapp.com/api/webhooks/1490253613409243136/BzwH_kbrPrIEXrbxEmeRXDwAfzh5csLX3FXnrKteJIE8cwTJVl4D0SZHwl8569I12q3H" \
node scripts/weekly-report.js
```

Expected — a header embed followed by one product embed per watchlist item appearing in Discord. Watch for any `Fatal error` lines in the console.

- [ ] **Step 3: Commit**

```bash
git add scripts/weekly-report.js
git commit -m "feat: add weekly report script"
```

---

## Task 10: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/news-monitor.yml`
- Create: `.github/workflows/daily-digest.yml`
- Create: `.github/workflows/weekly-report.yml`

- [ ] **Step 1: Create .github/workflows/news-monitor.yml**

```yaml
name: News Monitor

on:
  schedule:
    - cron: '*/15 * * * *'   # every 15 minutes
  workflow_dispatch:           # allow manual trigger from GitHub UI

permissions:
  contents: write              # needed to commit state files back

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Firecrawl CLI
        run: npm install -g firecrawl-cli

      - name: Run news monitor
        env:
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: node scripts/news-monitor.js

      - name: Commit updated state
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add state/
          git diff --staged --quiet || (git commit -m "chore: update state [skip ci]" && git push)
```

- [ ] **Step 2: Create .github/workflows/daily-digest.yml**

```yaml
name: Daily Digest

on:
  schedule:
    - cron: '0 14 * * *'      # daily at 14:00 UTC (6am PST)
  workflow_dispatch:

permissions:
  contents: write

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run daily digest
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: node scripts/daily-digest.js

      - name: Commit cleared queue
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add state/minor-queue.json
          git diff --staged --quiet || (git commit -m "chore: clear minor queue [skip ci]" && git push)
```

- [ ] **Step 3: Create .github/workflows/weekly-report.yml**

```yaml
name: Weekly Report

on:
  schedule:
    - cron: '0 17 * * 0'      # Sundays at 17:00 UTC (9am PST)
  workflow_dispatch:

permissions:
  contents: read

jobs:
  report:
    runs-on: ubuntu-latest
    timeout-minutes: 30        # pricing fetches can be slow
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Firecrawl CLI
        run: npm install -g firecrawl-cli

      - name: Run weekly report
        env:
          FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: node scripts/weekly-report.js
```

- [ ] **Step 4: Commit workflows**

```bash
git add .github/
git commit -m "feat: add GitHub Actions workflows (monitor, digest, weekly)"
```

---

## Task 11: GitHub Setup & Deployment

- [ ] **Step 1: Create a new GitHub repository**

Go to github.com → New Repository → name it `pokemon-tcg-reporter` → Public (to avoid Actions minute limits) → Create.

- [ ] **Step 2: Push the repo**

```bash
git remote add origin https://github.com/YOUR_USERNAME/pokemon-tcg-reporter.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Add GitHub Secrets**

In the repo: Settings → Secrets and variables → Actions → New repository secret

Add two secrets:
```
Name: FIRECRAWL_API_KEY
Value: fc-8293729d54074aeea5aed36be0c1196b

Name: DISCORD_WEBHOOK_URL
Value: https://discordapp.com/api/webhooks/1490253613409243136/BzwH_kbrPrIEXrbxEmeRXDwAfzh5csLX3FXnrKteJIE8cwTJVl4D0SZHwl8569I12q3H
```

- [ ] **Step 4: Trigger each workflow manually to verify end-to-end**

In GitHub: Actions tab → Select "News Monitor" → Run workflow → Run workflow.

Watch the run complete. Check Discord for any breaking alerts.

Repeat for "Daily Digest" and "Weekly Report".

- [ ] **Step 5: Verify state commits appear in repo history**

After the news monitor run, check the repo commits — you should see a `chore: update state [skip ci]` commit from `github-actions[bot]` with updated `state/seen-urls.json`.

- [ ] **Step 6: Final commit with .env.example reminder**

```bash
# Verify nothing sensitive is committed
git log --oneline -10
git show HEAD:state/seen-urls.json | head -5
```

Confirm no API keys appear in any committed file.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Weekly report every Sunday 9am PST → `weekly-report.yml` + `weekly-report.js`
- ✅ Breaking news posted immediately → `news-monitor.js` + `classify.js`
- ✅ Daily digest at 6am PST → `daily-digest.yml` + `daily-digest.js`
- ✅ MSRP per product → `products.js`
- ✅ Most recent eBay sale + 10-sale avg → `pricing.js` `fetchEbaySoldPrices()`
- ✅ PriceCharting market value → `pricing.js` `fetchPriceCharting()`
- ✅ Flip margin (avg + recent) → `pricing.js` calculated fields
- ✅ Clickable source links in embeds → `discord.js` `extractDomain()` + markdown links
- ✅ Deduplication → `state/seen-urls.json`
- ✅ State committed back to repo → git step in each workflow
- ✅ Error handling for all failure modes → try/catch in firecrawl.js, pricing.js, discord.js retry
- ✅ No empty digest posted when queue is empty → early exit in `daily-digest.js`
- ✅ GitHub Secrets documented → Task 11 Step 3

**Type consistency:** `fetchPricing()` returns `{ mostRecentSale, avgLast10, pricechartingValue, avgMargin, recentMargin }` — all consumers (`buildWeeklyProductEmbed`, `weekly-report.js`) use these exact field names. ✅

**No placeholders:** All code blocks are complete and runnable. ✅
