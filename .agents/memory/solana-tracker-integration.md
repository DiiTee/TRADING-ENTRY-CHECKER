---
name: Solana Tracker Integration
description: Full ST enrichment layer — holder count, OHLCV fallback, wallet enrichment, settings wiring, and critical shape/reset constraints.
---

## What was built

Solana Tracker (ST) is a complementary enrichment layer added in `trading-entry-checker.html`. It never replaces DexScreener, RugCheck, Helius, or GeckoTerminal.

## Key functions (all in the ST Engine JS block, before fetchFromCA)

- `stGetKey()` — reads `tec_solanatracker_key` from localStorage
- `stFetch(path, cacheKey, ttl)` — core fetcher: cache → budget → 600ms rate throttle → retry with backoff
- `stFetchTokenHolders(ca)` — fetches holder count, calls `tecSaveHolderSnap` to store in existing per-CA snapshot DB
- `stFetchOHLCV(poolOrToken, resolution)` — fetches candles, converts ST "oclhv" format `[ts_ms, o, c, l, h, v]` to GT format `[ts_sec, o, h, l, c, v]`
- `stFetchWalletData(address, ca)` — wallet holdings + trade history (on-demand only)
- `stRenderBudgetDisplay()` — renders budget bar in Settings (element id: `stBudgetDisplay`)
- `updateHolderFieldLabels()` — updates `lblHoldersH1/H6/H24` label text using `settings.holderTf1/2/3`

## Critical constraint: _tecCandles object shape

`window._tecCandles` must ALWAYS be set as an object `{ current, macroFloor, localFloor, floor15mLow, ceiling1hHigh, high, low, source, structuralAnalysis }` — never as a raw array. The ST OHLCV fallback builds this same shape. Many downstream paths (`buildEntryBriefingHTML`, pattern analysis at line 4473, etc.) read `.structuralAnalysis`, `.current`, etc.

**Why:** Reviewer caught the original implementation setting `_tecCandles = _stCandles` (raw array), which silently broke all downstream consumers.

## Critical constraint: _stHolderData reset per fetch

`window._stHolderData = null` is reset at the very start of `fetchFromCA` (alongside `_tecCandles = null`). The Security Briefing ST block reads this global; without the reset, stale data from a previous token scan leaks into the next token's display.

**Why:** Reviewer caught that the global was only set on success, never cleared on new scan start.

## Settings wiring

- `DEFAULT_SETTINGS`: `holderTf1: 1, holderTf2: 3, holderTf3: 5`
- `applySettingsToUI` / `readSettingsFromUI` / `loadSettings` / `saveSettings` all wired for `sHolderTf1/2/3`, `sSolanaTrackerKey`, `sStBudgetLimit`
- ST key stored as `tec_solanatracker_key`; budget limit as `tec_st_budget_limit`; monthly counter as `tec_st_budget` (JSON: `{month, count}`)

## Holder history — minute-based timeframes

The 3 holder history auto-population calls in `fetchFromCA` (after holder snap is stored) now use `settings.holderTf1/2/3` minutes instead of fixed hours. Tolerance is `max(30s, tf/2)` for each timeframe. Labels on form fields update dynamically via `updateHolderFieldLabels()`.

## OHLCV fallback location

Inside the GeckoTerminal `catch` block (after `addDiag('fail', 'GeckoTerminal', ...)`). Only fires when GeckoTerminal fails AND ST key is present. Uses `fetched.poolAddress || ca` as the chart target.

## ST OHLCV format conversion

ST returns `oclhv`: `[timestamp_ms, open, close, low, high, volume]`
GT expects: `[timestamp_sec, open, high, low, close, volume]`
Mapping: `[c[0]/1000, c[1], c[4], c[3], c[2], c[5]]`

## Wallet enrichment (step 3b in wliRunScan)

Runs only when: ST key set AND profile confidence still 'Low' after Helius enrichment. Fetches holdings + trades, stores in `profile.stData`, upgrades confidence to 'Medium' if any data returned. Never runs automatically in the background.

## Security Briefing display

ST holder intelligence block appears after the SEC checklist (`forEach` loop end), before Dev Reputation. Reads `window._stHolderData` (set during `fetchFromCA`) and `tec_hs_{ca}` localStorage for growth trend. Uses `el('fCA').value` for the CA (NOT `window._tecCurrentCA` which doesn't exist).
