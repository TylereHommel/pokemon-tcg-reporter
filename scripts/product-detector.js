// scripts/product-detector.js
// Scans scraped article content for Pokemon TCG sealed collection product announcements.
// Detects: ETB, Booster Box, Booster Bundle, Premium Collection, Super Premium Collection.
// Returns array of product objects ready to add to the watchlist.

// Order matters — check more specific types before generic ones to avoid partial matches
const COLLECTION_TYPES = [
  { patterns: ['super premium collection'],               label: 'Super Premium Collection', slug: 'super-premium-collection', defaultMsrp: 79.99  },
  { patterns: ['poster collection'],                      label: 'Poster Collection',        slug: 'poster-collection',        defaultMsrp: 19.99  },
  { patterns: ['pin collection'],                         label: 'Pin Collection',           slug: 'pin-collection',           defaultMsrp: 14.99  },
  { patterns: ['premium collection'],                     label: 'Premium Collection',       slug: 'premium-collection',       defaultMsrp: 39.99  },
  { patterns: ['elite trainer box', ' etb '],             label: 'ETB',                      slug: 'elite-trainer-box',        defaultMsrp: 54.99  },
  { patterns: ['booster bundle'],                         label: 'Booster Bundle',           slug: 'booster-bundle',           defaultMsrp: 29.99  },
  { patterns: ['booster box'],                            label: 'Booster Box',              slug: 'booster-box',              defaultMsrp: 143.64 },
  { patterns: ['3-pack blister', '3 pack blister', 'three pack blister'], label: '3-Pack Blister', slug: '3-pack-blister', defaultMsrp: 11.99 },
  { patterns: ['collection box'],                         label: 'Collection Box',           slug: 'collection-box',           defaultMsrp: null   },
];

/**
 * Try to extract the set name from a news headline.
 * @param {string} title
 * @returns {string|null}
 */
function extractSetName(title) {
  // Quoted name: 'Stellar Crown' or "Stellar Crown"
  const quoted = title.match(/['"]([\w\s]{3,40})['"]/);
  if (quoted) return quoted[1].trim();

  // After "Pokemon TCG:" or "Pokemon TCG –"
  const afterColon = title.match(/Pokemon\s+TCG[:\-–]\s*([\w\s]+?)(?:\s+(?:announced|revealed|confirmed|coming|releases?|ETB|booster|expansion|collection)|$)/i);
  if (afterColon) {
    const name = afterColon[1].replace(/^(?:new|the)\s+/i, '').trim();
    if (name.length > 3) return name;
  }

  // Words before "set" or "expansion" + action word
  const beforeSet = title.match(/([\w\s]{3,40?}?)\s+(?:set|expansion)\s+(?:announced|revealed|confirmed)/i);
  if (beforeSet) {
    const name = beforeSet[1].replace(/^(?:pokemon|tcg|new|the|a)\s+/i, '').trim();
    if (name.length > 3) return name;
  }

  return null;
}

/**
 * Try to find an MSRP in the text around a given index.
 * @param {string} text
 * @param {number} idx  index of the product type mention
 * @returns {number|null}
 */
function extractNearbyMsrp(text, idx) {
  const window = text.substring(Math.max(0, idx - 150), idx + 300);
  const match = window.match(/\$(\d+(?:\.\d{2})?)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Convert a display name to a URL-safe slug.
 * @param {string} name
 * @returns {string}
 */
function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Detect new sealed collection products in a scraped article.
 * @param {string} title      Article headline
 * @param {string} content    Scraped article body
 * @param {string} sourceUrl  Source URL for attribution
 * @param {string[]} existingNames  Already-tracked product names (lowercase) to skip
 * @returns {object[]}  Array of new product objects
 */
function detectProducts(title, content, sourceUrl, existingNames = []) {
  const text = `${title}\n${content}`.toLowerCase();

  const setName = extractSetName(title) || extractSetName(content.substring(0, 800));
  if (!setName) {
    console.log('[product-detector] Could not extract set name from:', title);
    return [];
  }

  const setSlug = toSlug(setName);
  // Best-effort PriceCharting set slug — most current sets are Scarlet & Violet era
  const pricechartingSet = `pokemon-scarlet-violet-${setSlug}`;

  // Try to extract chase card mention
  const chaseMatch = text.match(
    /(?:chase card|special illustration rare|sir confirmed)[:\s]+([a-zA-Z\s']{3,40}?(?:ex|vstar|v\b)?)\s*(?:#\d+)?/i
  );
  const chaseCard = chaseMatch ? chaseMatch[1].trim() : 'TBD';

  const detected = [];

  for (const type of COLLECTION_TYPES) {
    // Find earliest occurrence of this product type
    let foundIdx = -1;
    for (const p of type.patterns) {
      const idx = text.indexOf(p);
      if (idx !== -1 && (foundIdx === -1 || idx < foundIdx)) foundIdx = idx;
    }
    if (foundIdx === -1) continue;

    const productName = `${setName} ${type.label}`;
    if (existingNames.includes(productName.toLowerCase())) continue;

    const msrp = extractNearbyMsrp(text, foundIdx) ?? type.defaultMsrp;

    detected.push({
      name: productName,
      msrp,
      tier: 2,
      ebaySearchTerm: `pokemon ${setName.toLowerCase()} ${type.label.toLowerCase()}`,
      pricechartingSet,
      pricechartingProduct: type.slug,
      chaseCard,
      skus: { pokemonCenter: 'TBD', target: 'TBD', walmart: 'TBD', amazon: 'TBD' },
      autoDetected: true,
      sourceUrl,
      detectedAt: new Date().toISOString(),
    });
  }

  console.log(`[product-detector] Set: "${setName}" — found ${detected.length} products`);
  return detected;
}

module.exports = { detectProducts };
