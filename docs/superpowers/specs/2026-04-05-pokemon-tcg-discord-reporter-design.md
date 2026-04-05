# Pokemon TCG Discord Sentiment Reporter — Design Spec
**Date:** 2026-04-05  
**Status:** Approved  
**Platform:** GitHub Actions (free tier)

---

## Overview

An automated Discord reporting system that monitors Pokemon TCG sentiment, pricing, and news. Delivers one weekly full sentiment report, real-time breaking news alerts, and a daily digest of minor updates — all to a single Discord channel via webhook.

---

## Architecture

Three independent GitHub Actions workflows share two state files committed to the repo.

```
GitHub Actions
│
├── weekly-report.yml       [Sunday 9am PST / 17:00 UTC]
│     └── scripts/weekly-report.js
│
├── news-monitor.yml        [every 15 minutes]
│     └── scripts/news-monitor.js
│
└── daily-digest.yml        [6am PST / 14:00 UTC daily]
      └── scripts/daily-digest.js

Shared modules:
  scripts/discord.js        — webhook POST + embed formatter
  scripts/firecrawl.js      — Firecrawl CLI wrapper, returns parsed JSON
  scripts/classify.js       — breaking vs minor news classifier
  scripts/pricing.js        — eBay sold + PriceCharting scraper

State files (committed to repo after each run):
  state/seen-urls.json      — array of URLs already posted (dedup)
  state/minor-queue.json    — array of pending minor news items
```

---

## GitHub Secrets

| Secret | Value |
|--------|-------|
| `FIRECRAWL_API_KEY` | (set in GitHub repo → Settings → Secrets) |
| `DISCORD_WEBHOOK_URL` | (set in GitHub repo → Settings → Secrets) |

---

## Product Watchlist (Initial)

Hardcoded in `scripts/products.js`. Updated manually as new sets release.

| Product | MSRP | Tier |
|---------|------|------|
| Prismatic Evolutions ETB | $54.99 | 1 |
| Prismatic Evolutions Super Premium Collection | $79.99 | 1 |
| Prismatic Evolutions Booster Bundle | $29.99 | 1 |
| Destined Rivals ETB | $54.99 | 1 |
| Destined Rivals Booster Bundle | $29.99 | 1 |
| Destined Rivals Booster Box | $143.64 | 1 |
| 30th Anniversary First Partner Collection Series 1 | TBD | 2 |
| Journey Together ETB | $54.99 | 2 |
| Journey Together Booster Bundle | $29.99 | 2 |
| Ascended Heroes ETB | $54.99 | 2 |
| Mega Evolution: Chaos Rising ETB | $54.99 | 2 |

---

## Workflows

### 1. weekly-report.yml — Full Sentiment Report

**Schedule:** Every Sunday at 17:00 UTC (9am PST)

**Steps:**
1. Checkout repo
2. Install Node.js dependencies
3. Run `scripts/weekly-report.js`:
   - Execute 8 parallel Firecrawl searches (Reddit, TCGPlayer, news sources, eBay)
   - For each Tier 1 and Tier 2 product, call `pricing.js` to fetch:
     - Most recent eBay sold price + date (browser mode scrape)
     - Average of last 10 eBay sold prices
     - PriceCharting market value (static scrape)
     - Calculated flip margin % vs MSRP
   - Classify each product into Tier 1 / Tier 2 / Tier 3 / Skip based on sentiment scores
   - Format one Discord embed per Tier 1/2 product
   - POST all embeds to Discord webhook sequentially

**Discord embed per product:**
```
🔴 TIER 1 — Prismatic Evolutions ETB
Hype: ████████████ 94/100 | Bias: 94/100
Chase: Umbreon ex #161 SIR

💰 MSRP:             $54.99
📦 Most Recent Sale: $112.00 (Apr 5)
📊 10-Sale Avg:      $98.40
🏪 PriceCharting:    $94.00
📈 Flip Margin:      +79% (avg) | +104% (recent)

✅ Recommendation: CHASE
```

---

### 2. news-monitor.yml — Breaking News Detector

**Schedule:** Every 15 minutes

**Steps:**
1. Checkout repo (with state files)
2. Install dependencies
3. Run `scripts/news-monitor.js`:
   - Firecrawl search: Pokemon TCG news from past 1 hour (`--tbs qdr:h`)
   - Load `state/seen-urls.json`
   - Filter out already-seen URLs
   - For each new item, run through `classify.js`:
     - **BREAKING** if any keyword matches (see classifier section)
     - **MINOR** otherwise
   - BREAKING items: POST immediately to Discord, add URL to seen-urls
   - MINOR items: append to `state/minor-queue.json`, add URL to seen-urls
4. Commit updated state files back to repo

**Breaking alert embed:**
```
🚨 BREAKING — Pokemon TCG
━━━━━━━━━━━━━━━━━━━━━━━━━
Chase card revealed: Charizard ex SIR — Chaos Rising
🔗 Source: [PokeBeach](url) · 3 min ago

💰 Chaos Rising ETB MSRP: $54.99
📊 Pre-release eBay avg:  $89.00
📈 Est. Flip Margin:      +62%

⚡ Impact: HIGH — expected Tier 1 movement
```

---

### 3. daily-digest.yml — Minor News Batch

**Schedule:** Daily at 14:00 UTC (6am PST)

**Steps:**
1. Checkout repo (with state files)
2. Install dependencies
3. Run `scripts/daily-digest.js`:
   - Load `state/minor-queue.json`
   - If empty: exit silently (no message posted)
   - Format digest embed with all queued items, each with linked source
   - POST to Discord webhook
   - Clear `state/minor-queue.json`
4. Commit updated state back to repo

**Daily digest embed:**
```
📋 DAILY TCG DIGEST — Apr 6, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Minor updates from the last 24h:

• Destined Rivals booster box avg up 4% (now $261) — [TCGPlayer](url)
• Journey Together ETB restocked at Target — [Reddit](url)
• Speculation thread on Chaos Rising — [r/PokeInvesting](url)
• Ascended Heroes ETB +$5.47 today — [PriceCharting](url)
```

---

## News Classifier (classify.js)

Scores each news item by keyword presence. Score ≥ 3 → BREAKING. Score < 3 → MINOR.

| Keyword | Score |
|---------|-------|
| "chase card revealed" / "new card revealed" | 3 |
| "special illustration rare" / "SIR" | 3 |
| "new set announced" / "release date" | 3 |
| "sold out" / "selling out" | 2 |
| "restock" / "back in stock" | 2 |
| "price spike" / "prices are insane" | 2 |
| "surprise drop" / "early release" | 3 |
| "pokemon day" / "anniversary" | 2 |
| "booster box" + price mentioned | 1 |
| general market discussion | 1 |

---

## Pricing Module (pricing.js)

For each product on the watchlist:

1. **eBay sold listings** — Firecrawl browser mode scrape of completed sales
   - Extract last 10 sold prices + dates
   - Output: `mostRecentSale: { price, date }` and `avgLast10: number`

2. **PriceCharting** — static Firecrawl scrape
   - URL pattern: `pricecharting.com/game/pokemon-{set}/{product-slug}`
   - Output: `pricechartingValue: number`

3. **Flip margin** — calculated:
   - `avgMargin = ((avgLast10 - msrp) / msrp) * 100`
   - `recentMargin = ((mostRecentSale.price - msrp) / msrp) * 100`

---

## File Structure

```
/
├── .github/
│   └── workflows/
│       ├── weekly-report.yml
│       ├── news-monitor.yml
│       └── daily-digest.yml
├── scripts/
│   ├── weekly-report.js
│   ├── news-monitor.js
│   ├── daily-digest.js
│   ├── products.js       — watchlist + MSRPs
│   ├── firecrawl.js      — CLI wrapper
│   ├── discord.js        — webhook + embed builder
│   ├── classify.js       — breaking vs minor
│   └── pricing.js        — eBay + PriceCharting
├── state/
│   ├── seen-urls.json
│   └── minor-queue.json
├── docs/
│   └── superpowers/specs/
│       └── 2026-04-05-pokemon-tcg-discord-reporter-design.md
├── package.json
└── .env.example
```

---

## Error Handling

- Firecrawl API failure: log error, skip that search, continue with available data
- Discord webhook failure: retry once after 5 seconds, then log and exit
- eBay browser scrape failure: fall back to PriceCharting value only, mark `mostRecentSale` as unavailable
- State file missing: initialize as empty array and continue
- No new news items: exit silently (no empty embeds posted)

---

## Dependencies

```json
{
  "dependencies": {
    "node-fetch": "^3.3.2"
  },
  "devDependencies": {}
}
```

Firecrawl used via CLI (`firecrawl-cli` installed globally in GitHub Actions runner).

---

## Constraints

- GitHub Actions free tier: 2,000 min/month for **private** repos, unlimited for **public** repos. News monitor at 15min intervals = ~2,880 runs/month at ~30s each = ~1,440 min/month. Recommend making the repo **public** to avoid hitting the private repo limit. If private is required, increase monitor interval to 30min (~720 min/month).
- Firecrawl API credits: monitor usage via `firecrawl credit-usage` periodically.
- eBay browser scrape: uses Firecrawl browser credits (heavier). Only called during weekly report, not news monitor.
