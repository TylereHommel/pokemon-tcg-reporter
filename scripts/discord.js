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
 * Build a filled progress bar for a 0–100 score using emoji squares.
 * @param {number} score
 * @returns {string}  e.g. "🟩🟩🟩🟩🟩🟩🟩🟩⬛⬛"
 */
function progressBar(score) {
  const filled = Math.round(score / 10);
  return '🟩'.repeat(filled) + '⬛'.repeat(10 - filled);
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
 * Single consolidated weekly report embed (purple).
 * All products summarized in one Discord message.
 * @param {{ product: object, pricing: object, sentiment: object }[]} entries
 * @returns {object}  Discord webhook payload
 */
function buildWeeklyReportEmbed(entries) {
  const tier1 = entries.filter(e => e.product.tier === 1);
  const tier2 = entries.filter(e => e.product.tier === 2);

  const formatEntry = ({ product, pricing, sentiment }) => {
    const tierEmoji = product.tier === 1 ? '🔴' : '🟡';
    const rec = sentiment.score >= 70 ? '✅ CHASE'
              : sentiment.score >= 40 ? '🟡 HOLD'
              : '❌ SKIP';
    const pcText = pricing.pricechartingValue != null
      ? `$${pricing.pricechartingValue.toFixed(2)}`
      : 'N/A';
    const marginText = pricing.avgMargin != null
      ? ` (+${pricing.avgMargin.toFixed(0)}%)`
      : '';
    const chase = product.chaseCard && product.chaseCard !== 'TBD'
      ? ` · 🃏 ${product.chaseCard}`
      : '';
    const pricechartingUrl = `https://www.pricecharting.com/game/${product.pricechartingSet}/${product.pricechartingProduct}`;
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.ebaySearchTerm + ' sealed')}&LH_Sold=1&LH_Complete=1&_sop=13`;

    const skus = product.skus || {};
    const skuLine = [
      `PKC: ${skus.pokemonCenter || 'TBD'}`,
      `TGT: ${skus.target || 'TBD'}`,
      `WMT: ${skus.walmart || 'TBD'}`,
      `AMZ: ${skus.amazon || 'TBD'}`,
    ].join(' · ');

    return [
      `${tierEmoji} **${product.name}**${chase} — [PC](${pricechartingUrl}) · [eBay](${ebayUrl})`,
      `${progressBar(sentiment.score)} ${sentiment.score}/100 | MSRP $${product.msrp.toFixed(2)} | PC ${pcText}${marginText} | ${rec}`,
      `🏬 ${skuLine}`,
    ].join('\n');
  };

  const header = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSourced from Reddit · TCGPlayer · PriceCharting · eBay';

  const tier1Lines = ['**— TIER 1 —**', ...tier1.map(formatEntry).flatMap(l => [l, ''])];
  const tier2Lines = ['**— TIER 2 —**', ...tier2.map(formatEntry).flatMap(l => [l, ''])];

  return {
    embeds: [
      {
        title: `🎯 WEEKLY TCG SENTIMENT REPORT — ${formatDate()}`,
        description: [header, '', ...tier1Lines].join('\n').trimEnd(),
        color: 0x9B59B6,
        timestamp: new Date().toISOString(),
      },
      {
        description: tier2Lines.join('\n').trimEnd(),
        color: 0x9B59B6,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * New product auto-detected embed (green).
 * @param {object} product  Auto-detected product object
 * @returns {object}  Discord webhook payload
 */
function buildNewProductEmbed(product) {
  const msrpText = product.msrp != null ? `$${product.msrp.toFixed(2)}` : 'TBD';
  const chase = product.chaseCard && product.chaseCard !== 'TBD' ? product.chaseCard : 'Not yet revealed';

  return {
    embeds: [{
      title: `🆕 NEW PRODUCT DETECTED — ${product.name}`,
      description: [
        `💰 MSRP: ${msrpText}`,
        `🃏 Chase Card: ${chase}`,
        `🏷️ Auto-assigned Tier 2`,
        `🔗 Source: [${extractDomain(product.sourceUrl)}](${product.sourceUrl})`,
        '',
        '_Added to weekly tracking automatically._',
      ].join('\n'),
      color: 0x2ECC71,
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
  buildWeeklyReportEmbed,
  buildNewProductEmbed,
  formatDate,
};
