---
name: Wallet Intelligence Engine
description: Quick Scan reputation engine added to Wallet Library — scoring, tags, filter/sort, ranked results panel.
---

## Architecture
- Storage: `tec_wallet_intel` localStorage — object keyed by `address.toLowerCase()`, value = profile
- Engine globals: `_wlibIntel`, `_wlibSortBy`, `_wlibFilterScore`, `_wlibFilterTag`, `_wlibAnalyzing`
- All JS functions prefixed `wli*`; filter/sort helpers update `_wllib*` state vars and call `wlibRender()`
- `wlibRender()` now calls `wlibGetFiltered()` instead of rendering `_walletLibrary` directly — do NOT bypass this

## Dev wallet collection — single source of truth: rlDevInput
`wlibCollectDev` is called only from `updateRickbotLinks()`. Every dev address path (RugCheck creator, QEC creator, bot parse, manual paste) routes through `qecSetDevAddress()` which always overwrites `rlDevInput.value` then calls `updateRickbotLinks()`. This prevents stale dev addresses from a previous token being associated with a new CA.

## CRITICAL: Source labels are neutral — do NOT use as risk signals
- `QEC` = top holders via RugCheck (neutral observation)
- `Top Holders` = top holders via Helius (neutral observation — previously mislabeled "Cabal Briefing")
- `Cabal Briefing` = legacy label for same thing — backward compat only, treated identically to Top Holders
- `Dev` = developer wallet — distinct signal only when combined with holder appearances in OTHER projects

## Observation model (wlibAdd extras parameter)
Each entry now stores optional: `holderRank` (1-based position), `tokenSecTier`, `tokenSecScore`
Collectors pass current `window._tecSecTier` / `window._tecSecScore` at scan time.

## Two-layer architecture (per spec)
- Layer 1: Wallet Screening Engine — `wliRunScan` 4-step escalating flow, useful from first scan
- Layer 2: Wallet Reputation Engine — `wliAnalyzeAddress` builds from library observations over time

## wliRunScan — 4-step flow
1. High-confidence cached profile ≤7 days old → reuse, zero API calls
2. Build from Wallet Library (`wliAnalyzeAddress`) or create first-encounter shell
3. Adaptive enrichment: ONLY when `confidence === 'Low'` OR top-5 holder never enriched — never enrich Medium/High confidence wallets (API is last resort)
4. Compute `investigationPriority` (1/2/3 stars), save to cache
- Enrichment fields reset before each `wliHeliusEnrich` call for idempotency (no score ratcheting)

## Helius enrichment — Enhanced Transactions API
- Endpoint: `GET https://api.helius.xyz/v0/addresses/{addr}/transactions?api-key=KEY&limit=20`
- Extracts: swapCount, defiSources (JUPITER etc.), uniqueTokensTraded, oldestTxAgeDays, swapRatio
- Classifications: "Possible Smart Money" (aggregator user, active), "Possible Early Mover" (active + top holder or diverse), "New Wallet" (new or no history), "Neutral" (confirmed active, no strong signal)
- Holder rank context (from `_heliusHolderData.traderHolders`) passed in from `wliAnalyzeTokenUI`

## Investigation Priority
- `wliComputeInvestigationPriority(profile)` → 3 (⭐⭐⭐ High), 2 (⭐⭐ Medium), 1 (⭐ Low)
- High: tag match (Smart Money/Early Mover/Insider variants), score ≥72, or top-3 holder with enrichment + swaps
- Medium: tag match (High Conviction Holder/Dev Association), score ≥54, enriched with ≥2 swaps, or rank ≤8
- Results sorted: priority desc → score desc → confidence desc

## Quick Scan logic (wliAnalyzeAddress)
- Aggregates: `devCount`, `holderCount` (QEC + Top Holders + legacy Cabal — all neutral), `avgPct`, `avgRank`, `avgSecScore`
- Base score 50; appearance bonus (+3/token up to +18); conviction bonus (+3–7 for avgPct); top-rank bonus (+5 if avgRank≤5 with 2+ sigs); dev+holder risk (-15); token security history adjustment
- Confidence: Low (1 seen), Medium (2–4), High (5+)
- Helius enrichment via `wliHeliusEnrich()` — only called when confidence=Low AND timesSeen≤1 AND key available
  - Uses `getSignaturesForAddress` limit:10 — estimates activity level, detects brand-new wallets
  - Adds "New Wallet" tag and -10 score if wallet shows <30 days of activity
  - Upgrades confidence Low→Medium if wallet confirmed active

## Reputation Tags (controlled set — do not add ad-hoc)
Positive: Smart Money, Early Mover, Profitable Trader, High Conviction Holder, Quality Accumulator, Consistent Winner
Risk: Probable Insider, Suspected Cabal, Rug Risk, Serial Dumper, Pump-and-Dump Participant, Coordinated Trading, Wash Trading Suspected
Neutral: Neutral, Limited History, New Wallet, Inconclusive, Developer Association

## Score Tiers
90+ Elite, 75–89 Strong, 60–74 Good, 40–59 Neutral, 20–39 Risky, 0–19 Avoid

## XSS safety
- `escH(s)` and `escA(s)` helpers defined in the engine block — use for ALL user/imported data in innerHTML
- Numbers cast with `Number()` before insertion; score/label/tier from `wliScoreTier()` are safe constants
- `w.id` is app-generated (digits + alphanumeric only) — safe in onclick; still escaped via `escA()` for consistency

## Empty-state behavior in wlibRender
- Library empty → static "no wallets collected" message
- Library non-empty but filter excludes all → distinct "no wallets match filter" message (innerHTML overwrite in wlibRender)

## Deep Investigation
Not yet implemented. Reserved for future on-demand use requiring Helius RPC (already present in app via `fetchHeliusTopHolders`).

**Why:** Deep Investigation needs explicit user consent and a Helius API key — keeping it out of Quick Scan respects the spec's budget and API-minimization requirements.
