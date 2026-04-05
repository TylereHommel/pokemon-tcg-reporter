// scripts/pricing.js
// Fetches pricing data for a product:
//   - eBay sold listings (browser scrape for JS-rendered page)
//   - PriceCharting market value (static scrape)
// Returns a normalized pricing object.

const { scrape, browserScrape } = require('./firecrawl');

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

function parseRecentDate(text) {
  const dateRegex = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/;
  const match = text.match(dateRegex);
  return match ? match[0] : null;
}

function fetchEbaySoldPrices(product) {
  try {
    const query = encodeURIComponent(`${product.ebaySearchTerm} sealed`);
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

function fetchPriceCharting(product) {
  try {
    const url = `https://www.pricecharting.com/game/${product.pricechartingSet}/${product.pricechartingProduct}`;
    console.log(`  [pricing] PriceCharting scrape for: ${product.name}`);
    const md = scrape(url);
    if (!md) return null;
    const prices = parsePrices(md, product.msrp);
    return prices.length > 0 ? prices[0] : null;
  } catch (err) {
    console.error(`  [pricing] PriceCharting fetch failed for ${product.name}:`, err.message);
    return null;
  }
}

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
