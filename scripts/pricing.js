// scripts/pricing.js
// Fetches pricing data for a product via PriceCharting (static HTML scrape).
// eBay browser scraping removed — blocked by bot detection.
// All functions are async.

const { scrape } = require('./apify');

function parsePrices(text, msrp) {
  const prices = [];
  const regex = /(?:US\s*)?\$(\d{1,4}(?:\.\d{2})?)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const price = parseFloat(match[1]);
    if (price >= msrp * 0.5 && price <= msrp * 15) {
      prices.push(price);
    }
  }
  return prices;
}

async function fetchPriceCharting(product) {
  try {
    const url = `https://www.pricecharting.com/game/${product.pricechartingSet}/${product.pricechartingProduct}`;
    console.log(`  [pricing] PriceCharting scrape for: ${product.name}`);
    const text = await scrape(url);
    if (!text) return null;

    // Look for price adjacent to "Ungraded" in the plain text
    const ungradedMatch = text.match(/Ungraded\s*\$(\d+(?:\.\d{2})?)/i)
      || text.match(/\$(\d+(?:\.\d{2})?)\s{0,30}Ungraded/i);
    if (ungradedMatch) {
      const price = parseFloat(ungradedMatch[1]);
      if (price >= product.msrp * 0.5 && price <= product.msrp * 15) {
        return price;
      }
    }

    // Fallback: general price parser
    const prices = parsePrices(text, product.msrp);
    return prices.length > 0 ? prices[0] : null;
  } catch (err) {
    console.error(`  [pricing] PriceCharting fetch failed for ${product.name}:`, err.message);
    return null;
  }
}

async function fetchPricing(product) {
  const pricechartingValue = await fetchPriceCharting(product);

  const avgMargin = pricechartingValue != null
    ? Math.round(((pricechartingValue - product.msrp) / product.msrp) * 10000) / 100
    : null;

  return {
    mostRecentSale: null,
    avgLast10: null,
    pricechartingValue,
    avgMargin,
    recentMargin: null,
  };
}

if (process.argv.includes('--test')) {
  (async () => {
    const { PRODUCTS } = require('./products');
    const product = PRODUCTS.find(p => p.name === 'Ascended Heroes ETB');
    console.log(`Testing pricing fetch for: ${product.name}`);
    const result = await fetchPricing(product);
    console.log('Result:', JSON.stringify(result, null, 2));
    if (result.pricechartingValue == null) {
      console.warn('WARN: PriceCharting returned null — check scrape');
    } else {
      console.log('PASS');
    }
  })();
}

module.exports = { fetchPricing };
