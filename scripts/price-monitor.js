// scripts/price-monitor.js
// Runs daily at 6am PST via GitHub Actions.
// Fetches PriceCharting prices for all products, compares to last known prices,
// posts a Discord report if any prices changed.

const path = require('path');
const fs = require('fs');
const { fetchPricing } = require('./pricing');
const { postWebhook } = require('./discord');
const { getAllProducts } = require('./products');
const { formatDate } = require('./discord');

const PRICE_HISTORY_PATH = path.join(__dirname, '..', 'state', 'price-history.json');

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(PRICE_HISTORY_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveHistory(data) {
  fs.writeFileSync(PRICE_HISTORY_PATH, JSON.stringify(data, null, 2));
}

function arrow(pct) {
  if (pct >= 5)  return '🚀';
  if (pct >= 2)  return '📈';
  if (pct <= -5) return '🔻';
  if (pct <= -2) return '📉';
  return '➡️';
}

function buildPriceChangeEmbed(changes, unchanged) {
  const lines = changes.map(({ product, prev, curr, delta, pct }) => {
    const sign = delta >= 0 ? '+' : '';
    return `${arrow(pct)} **${product.name}**\n$${prev.toFixed(2)} → $${curr.toFixed(2)} (${sign}$${delta.toFixed(2)} / ${sign}${pct.toFixed(1)}%)`;
  });

  if (unchanged.length > 0) {
    lines.push(`\n➡️ _No change: ${unchanged.map(p => p.name).join(', ')}_`);
  }

  return {
    embeds: [{
      title: `📊 DAILY PRICE UPDATE — ${formatDate()}`,
      description: [
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        'Source: PriceCharting',
        '',
        ...lines,
      ].join('\n'),
      color: 0x3498DB,
      timestamp: new Date().toISOString(),
    }],
  };
}

async function main() {
  console.log('[price-monitor] Starting run at', new Date().toISOString());

  const products = getAllProducts();
  const history = loadHistory();
  const changes = [];
  const unchanged = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const product of products) {
    console.log(`[price-monitor] Checking: ${product.name}`);
    const pricing = await fetchPricing(product);
    const curr = pricing.pricechartingValue;

    if (curr == null) {
      console.log(`  No price data — skipping`);
      continue;
    }

    const prev = history[product.name]?.price ?? null;
    history[product.name] = { price: curr, date: today };

    if (prev == null) {
      console.log(`  First reading: $${curr}`);
      continue;
    }

    const delta = curr - prev;
    const pct = (delta / prev) * 100;

    // Only report if changed by at least $0.50 or 1%
    if (Math.abs(delta) >= 0.50 || Math.abs(pct) >= 1) {
      console.log(`  Changed: $${prev} → $${curr} (${pct.toFixed(1)}%)`);
      changes.push({ product, prev, curr, delta, pct });
    } else {
      console.log(`  Unchanged: $${curr}`);
      unchanged.push(product);
    }
  }

  saveHistory(history);

  if (changes.length === 0 && Object.keys(history).length > products.length / 2) {
    console.log('[price-monitor] No price changes — skipping Discord post.');
    return;
  }

  if (changes.length === 0) {
    console.log('[price-monitor] First run — seeding history, no Discord post.');
    return;
  }

  await postWebhook(buildPriceChangeEmbed(changes, unchanged));
  console.log(`[price-monitor] Posted — ${changes.length} changes, ${unchanged.length} unchanged.`);
}

main().catch(err => {
  console.error('[price-monitor] Fatal error:', err);
  process.exit(1);
});
