// scripts/weekly-report.js
// Runs every Sunday at 9am PST via GitHub Actions.
// Searches for sentiment data, fetches pricing, posts one embed per product.

const { search } = require('./apify');
const { fetchPricing } = require('./pricing');
const { postWebhook, buildWeeklyReportEmbed } = require('./discord');
const { getAllProducts } = require('./products');

// Weighted keywords — higher weight = stronger signal for Pokemon TCG investing
const POSITIVE_KEYWORDS = [
  { kw: 'selling above msrp',    w: 3 },
  { kw: 'above retail',          w: 3 },
  { kw: 'sold out everywhere',   w: 3 },
  { kw: 'flip profit',           w: 3 },
  { kw: 'resell profit',         w: 3 },
  { kw: 'must buy',              w: 2 },
  { kw: 'instant buy',           w: 2 },
  { kw: 'can\'t find',           w: 2 },
  { kw: 'hard to find',          w: 2 },
  { kw: 'sold out',              w: 2 },
  { kw: 'price climbing',        w: 2 },
  { kw: 'going up',              w: 2 },
  { kw: 'chase card',            w: 2 },
  { kw: 'limited print',         w: 2 },
  { kw: 'worth buying',          w: 1 },
  { kw: 'good investment',       w: 1 },
  { kw: 'hype',                  w: 1 },
  { kw: 'demand',                w: 1 },
  { kw: 'scarce',                w: 1 },
  { kw: 'flipping',              w: 1 },
];

const NEGATIVE_KEYWORDS = [
  { kw: 'not worth buying',      w: 3 },
  { kw: 'waste of money',        w: 3 },
  { kw: 'bad investment',        w: 3 },
  { kw: 'overproduced',          w: 3 },
  { kw: 'sitting on shelves',    w: 3 },
  { kw: 'skip this set',         w: 3 },
  { kw: 'price dropping',        w: 2 },
  { kw: 'below retail',          w: 2 },
  { kw: 'not worth',             w: 2 },
  { kw: 'disappointing pulls',   w: 2 },
  { kw: 'bad pulls',             w: 2 },
  { kw: 'crashing',              w: 2 },
  { kw: 'overpriced',            w: 1 },
  { kw: 'avoid',                 w: 1 },
  { kw: 'skip',                  w: 1 },
  { kw: 'bubble',                w: 1 },
  { kw: 'tank',                  w: 1 },
];

/**
 * Score sentiment for a product based on search results.
 * @param {{ title: string, url: string, description: string }[]} results
 * @param {object} product
 * @returns {{ score: number, biasScore: number, sources: {title:string, url:string}[] }}
 */
function scoreSentiment(results, product) {
  const nameTokens = product.name.toLowerCase().split(' ').slice(0, 3);
  let positiveScore = 0;
  let negativeScore = 0;
  let mentions = 0;
  const sources = [];

  for (const result of results) {
    const text = `${result.title} ${result.description || ''}`.toLowerCase();
    const mentioned = nameTokens.some(t => text.includes(t));
    if (!mentioned) continue;
    mentions++;

    let resultPos = 0;
    let resultNeg = 0;
    for (const { kw, w } of POSITIVE_KEYWORDS) {
      if (text.includes(kw)) resultPos += w;
    }
    for (const { kw, w } of NEGATIVE_KEYWORDS) {
      if (text.includes(kw)) resultNeg += w;
    }
    positiveScore += resultPos;
    negativeScore += resultNeg;

    if ((resultPos > 0 || resultNeg > 0) && result.url) {
      sources.push({ title: result.title, url: result.url, net: resultPos - resultNeg });
    }
  }

  if (mentions === 0) return { score: 50, biasScore: 50, sources: [] };

  const total = positiveScore + negativeScore || 1;
  const score = Math.min(100, Math.max(0, Math.round((positiveScore / total) * 100)));
  const mentionRatio = Math.min(1, mentions / Math.max(results.length, 1));
  const biasScore = Math.min(100, Math.round(mentionRatio * 40 + score * 0.6));

  // Top 3 sources by absolute keyword weight
  const topSources = sources
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
    .slice(0, 3)
    .map(({ title, url }) => ({ title, url }));

  return { score, biasScore, sources: topSources };
}


async function main() {
  console.log('[weekly-report] Starting run at', new Date().toISOString());

  // Process all products (static + auto-detected), sorted by tier
  const sortedProducts = [...getAllProducts()].sort((a, b) => a.tier - b.tier);

  // Run targeted searches per set so results actually contain product names
  const setNames = [...new Set(sortedProducts.map(p => p.name.split(' ').slice(0, 2).join(' ')))];
  const QUERIES = [
    ...setNames.map(s => `pokemon "${s}" hype resell reddit 2026`),
    'pokemon tcg sealed investment flip profit 2026 site:reddit.com',
    'pokemon tcg sold out restock price spike 2026',
  ];

  console.log('[weekly-report] Fetching sentiment data...');
  const allResults = [];
  for (const query of QUERIES) {
    const results = await search(query, { limit: 10 });
    allResults.push(...results);
  }
  console.log(`[weekly-report] Got ${allResults.length} sentiment results`);
  const entries = [];

  for (const product of sortedProducts) {
    console.log(`[weekly-report] Processing: ${product.name}`);

    const sentiment = scoreSentiment(allResults, product);
    console.log(`  Sentiment: score=${sentiment.score}, bias=${sentiment.biasScore}`);

    console.log(`  Fetching pricing...`);
    const pricing = await fetchPricing(product);
    console.log(`  Pricing: pricecharting=$${pricing.pricechartingValue}, avg10=$${pricing.avgLast10}`);

    entries.push({ product, pricing, sentiment });
  }

  // Post all products in a single Discord message
  await postWebhook(buildWeeklyReportEmbed(entries));
  console.log('[weekly-report] Done — posted', entries.length, 'products in one message.');
}

main().catch(err => {
  console.error('[weekly-report] Fatal error:', err);
  process.exit(1);
});
