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
