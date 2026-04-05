// scripts/weekly-report.js
// Runs every Sunday at 9am PST via GitHub Actions.
// Searches for sentiment data, fetches pricing, posts one embed per product.

const { search } = require('./firecrawl');
const { fetchPricing } = require('./pricing');
const { postWebhook, buildWeeklyReportEmbed } = require('./discord');
const { getAllProducts } = require('./products');

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


async function main() {
  console.log('[weekly-report] Starting run at', new Date().toISOString());

  // Run 4 sentiment searches
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

  // Process all products (static + auto-detected), sorted by tier
  const sortedProducts = [...getAllProducts()].sort((a, b) => a.tier - b.tier);
  const entries = [];

  for (const product of sortedProducts) {
    console.log(`[weekly-report] Processing: ${product.name}`);

    const sentiment = scoreSentiment(allResults, product);
    console.log(`  Sentiment: score=${sentiment.score}, bias=${sentiment.biasScore}`);

    console.log(`  Fetching pricing...`);
    const pricing = fetchPricing(product);
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
