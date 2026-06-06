---
name: Social Intelligence Engine — Attention Briefing Architecture
description: Three-mode Social Intelligence Engine (FULL SOCIAL/PARTIAL SOCIAL/PROXY) with auto-fetch provider abstraction, new metrics (Mention Density, Author Concentration, Time-Weighted Confidence), incremental re-scan, and Deep Scan mode.
---

## Rule
`computeAttentionBriefing` contains the Social Intelligence Engine after all proxy signal calculations. It detects mode, computes new metrics from `window._tecSocialRaw`, blends scores, re-tiers, and returns expanded fields. `window._tecAttentionMode` is set here.

**Why:** Real social data (X/Twitter, Telegram, Reddit) should override or augment proxy-only signals when available, giving more accurate attention tier scoring.

## Mode Detection
- `FULL SOCIAL` (confidence HIGH): X AND Telegram data both available (h1 or h24 > 0).
- `PARTIAL SOCIAL` (confidence MEDIUM): any one platform available.
- `PROXY` (confidence LOW): no social data entered.
`window._tecAttentionMode` stores the current mode; read by `buildRecommendedEntryChecklist`.

## New Metrics (v2 — auto-fetch)
Three new metrics computed after mode detection in `computeAttentionBriefing`:

### Mention Density
- Source: `window._tecSocialRaw.x.timestamps` + `window._tecSocialRaw.reddit.timestamps`
- Formula: `total_mentions / time_span_minutes` (min span = 1 min)
- Labels: VERY HIGH (≥2/min), HIGH (≥0.5), MODERATE (≥0.1), LOW (≥0.02), VERY LOW (<0.02)
- Effect: Boosts/reduces `_vc` (velocity component) in social score: +15/+8/0/-5/-10

### Author Concentration Ratio
- Formula: `max_single_author_mentions / total_mentions`
- Labels + Penalties: EXTREME (≥55%, -20 pts), HIGH (≥35%, -10), MODERATE (≥20%, -4), LOW (<20%, 0)
- Effect: Applied as `authorConcentrationPenalty` to `attQualScore` (clamped 0-100)

### Time-Weighted Confidence
- Replaces simple mode-based attConfidence; stored as `twConfidence` + `twConfidenceReason`
- Ignition: coin <1h old + HIGH/VERY HIGH density → twConfidence = HIGH
- Early Burst: coin <12h + high density → MEDIUM (unless already HIGH)
- Cross-platform bonus: platformsActive ≥ 3 → bump one level
- Extreme concentration penalty: EXTREME CONCENTRATION → drop one level
- Reason string shown in Attention Briefing as ⚡ note below confidence badge

## Auto-Fetch Layer (Social Intelligence Engine v2)
Functions inserted after `buildAttentionBriefingHTML`:
- `getSocialAPIKey(keyName)` — reads from localStorage
- `loadSocialScanTimestamps()` / `saveSocialScanTimestamp(ca)` / `getLastSocialScanTimestamp(ca)` — per-CA incremental scan timestamps in `tec_social_scan_ts`
- `bucketsFromTimestamps(timestamps)` → `{m15,m30,h1,h3,h24}` counts
- `fetchTwitterAPIio(queries, limit, sinceTs)` — primary X provider, sends `X-API-Key` header, searches CA→ticker→name, appends `since_time:` for incremental
- `fetchApifyFallback(queries, limit)` — Apify Tweet Scraper v2 fallback (POST run-sync), 45s timeout
- `fetchRedditData(queries, limit, sinceTs)` — Reddit `/search.json` public API, no auth required
- `deriveRawMetrics(items)` → `{timestamps, authorMap}` from tweet/post arrays
- `populateSocialFormFields(xResult, rdResult)` — fills fSocX*/fSocRd* form fields + attaches timestamps/authorMap/buckets to result objects
- `socialScanSetStatus(html, borderColor)` / `socialScanSetBusy(busy)` — UI helpers
- `runSocialScan(isDeep)` — main entry: CA→ticker→name query build, orchestrates X+Reddit, handles fallback, stores `window._tecSocialRaw`, saves incremental timestamp, updates status

## Provider API Keys (localStorage)
- `tec_twitter_api_key` → TwitterAPI.io primary (endpoint: `api.twitterapi.io/twitter/tweet/advanced_search`)
- `tec_apify_key` → Apify token for tweet-scraper actor

Settings UI: added `sTwitterAPIKey` + `sApifyKey` fields; `applySettingsToUI`/`saveSettings` updated to load/save them.

## Raw Data Store
`window._tecSocialRaw = { x: {..., tweets, timestamps, authorMap, buckets, provider, usedQuery}, reddit: {..., posts, timestamps, authorMap, buckets}, scanTs, isDeep }`
Cleared/replaced on every scan. `computeAttentionBriefing` reads it at runtime.

## UI — Social Data Panel Buttons
`Scan Social` button (id: `socialScanBtn`) → `runSocialScan(false)` — 15 X + 10 Reddit posts
`Deep Scan` button (id: `socialDeepScanBtn`) → `runSocialScan(true)` — 50 X + 25 Reddit posts
Status row (id: `socialScanStatus`) — shows provider, query used, post counts, errors

## Social Score Composition (weights)
Velocity 35% | Acceleration 20% | Persistence 15% | Quality 15% | Source Expansion 10% | Narrative 5%
Velocity (`_vc`) also gets mention density boost: +15/+8/0/-5/-10

## Blending: Social 70% / Proxy 30%
`_blendPct = socialScore * 0.70 + proxyCorePct * 0.30` (PROXY mode: blendPct = proxyCorePct unchanged).

## Dynamic Checklist Weights (buildRecommendedEntryChecklist)
- FULL SOCIAL:    Sec 35%  · Str 35%  · Att 30%
- PARTIAL SOCIAL: Sec 38%  · Str 38%  · Att 24%
- PROXY:          Sec 42.5% · Str 42.5% · Att 15%

## Platform Weights (weighted mention aggregation)
X (ticker/CA avg): 0.85 | Telegram: 1.2 | Reddit: 0.5

## Attention History (attHistSave expansion)
Key: `tec_att_history`. Max 50 entries.
Snap now includes: `mentionDensity`, `authorConc`, `twConfidence`, `twConfReason`, `coinAgeMin`, `scanIsDeep`, `xProvider`, `rawXCount`, `rawRdCount`.

## Social Intelligence Display (buildAttentionBriefingHTML)
Shown only when `ab.attMode !== 'PROXY'`. New additions:
1. Time-Weighted Confidence reason — ⚡ note below confidence badge (when reason exists)
2. Mention Density card — after velocity/acceleration row, only when auto-fetch data exists
3. Author Concentration card — after persistence/quality/source row, only when auto-fetch data exists

## Form Fields (21 social fields)
X: fSocXM15/30/1h/3h/24h, fSocXUp1h/24h, fSocXRt
Tg: fSocTgM15/30/1h/3h/24h, fSocTgCh1h/24h, fSocTgFwd
Rd: fSocRdM1h/24h, fSocRdUp1h/24h
All added to WL_FIELDS and gatherFormData.

## How to apply
- To add new social platforms: add platform weight constant, add to `wMentions` aggregation, update `platformsActive`, update `attQualScore` unique-ratio pooling.
- `_wLabel` in checklist auto-updates based on `window._tecAttentionMode` — no manual sync needed.
- `toggleSocialDataPanel()` controls the HTML panel collapsing (uses `socialDataPanel` + `socialDataChevron` IDs).
- Telegram: manual entry ONLY. MTProto/GramJS requires a backend server — cannot run in pure browser.
