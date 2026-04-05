// scripts/products.js
// Static product watchlist. Update this file when new sets release.
// Auto-detected products are stored in state/dynamic-products.json and merged via getAllProducts().
// pricechartingSlug: the URL segment from pricecharting.com/game/pokemon-{slug}/{product-slug}
// ebaySearchTerm: used to build the eBay sold listing search URL

const path = require('path');
const fs = require('fs');

const DYNAMIC_PRODUCTS_PATH = path.join(__dirname, '..', 'state', 'dynamic-products.json');

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

/**
 * Returns static watchlist merged with auto-detected products from dynamic-products.json.
 * Deduplicates by name (case-insensitive).
 */
function getAllProducts() {
  let dynamic = [];
  try {
    dynamic = JSON.parse(fs.readFileSync(DYNAMIC_PRODUCTS_PATH, 'utf8'));
  } catch {
    // file missing or empty — treat as no dynamic products
  }
  const staticNames = new Set(PRODUCTS.map(p => p.name.toLowerCase()));
  const newDynamic = dynamic.filter(p => !staticNames.has(p.name.toLowerCase()));
  return [...PRODUCTS, ...newDynamic];
}

module.exports = { PRODUCTS, getAllProducts };
