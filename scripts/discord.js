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

  const pricechartingUrl = `https://www.pricecharting.com/game/${product.pricechartingSet}/${product.pricechartingProduct}`;
  const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.ebaySearchTerm + ' sealed')}&LH_Sold=1&LH_Complete=1&_sop=13`;

  const description = [
    `Hype: ${progressBar(sentiment.score)} ${sentiment.score}/100 | Bias: ${sentiment.biasScore}/100`,
    product.chaseCard && product.chaseCard !== 'TBD' ? `🃏 Chase: ${product.chaseCard}` : '',
    '',
    priceLines.join('\n'),
    '',
    rec,
    '',
    `🔗 [PriceCharting](${pricechartingUrl}) · [eBay Sold](${ebayUrl})`,
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
