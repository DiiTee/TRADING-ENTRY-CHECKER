---
name: Wallet Intelligence Engine
description: Quick Scan reputation engine added to Wallet Library — scoring, tags, filter/sort, ranked results panel.
---

## Architecture
- Storage: `tec_wallet_intel` localStorage — object keyed by `address.toLowerCase()`, value = profile
- Engine globals: `_wlibIntel`, `_wlibSortBy`, `_wlibFilterScore`, `_wlibFilterTag`, `_wlibAnalyzing`
- All JS functions prefixed `wli*`; filter/sort helpers update `_wllib*` state vars and call `wlibRender()`
- `wlibRender()` now calls `wlibGetFiltered()` instead of rendering `_walletLibrary` directly — do NOT bypass this

## Quick Scan logic (wliAnalyzeAddress)
- Operates purely on existing `_walletLibrary` entries — **zero external API calls**
- Aggregates: `timesSeen` (unique CAs), `devCount`, `cabCount`, `qecCount`, `avgHoldingPct`, date range
- Base score 50; appearance bonus (+3/token up to +18); cabal penalty (-13/token); conviction bonus (+3–7 for avgPct>1.5/3%)
- Confidence: Low (1 seen), Medium (2–4), High (5+); downgraded for mixed signals with <3 observations

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
