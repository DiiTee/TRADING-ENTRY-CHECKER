---
name: Solana Tracker Integration
description: Full ST Intelligence Engine wired into TEC — where it lives, how it works, pitfalls encountered.
---

## What was built
Complete Solana Tracker Data API enrichment layer integrated into `trading-entry-checker.html`.

## Engine location
The entire ST engine (~175 lines) lives **just before `buildSecurityBriefingHTML`** (~line 5476 in deduplicated file). Functions: `stGetKey`, `stGetMaxRequests`, `stGetMonthlyUsage`, `stAddUsage`, `stIsOverBudget`, `stRenderBudgetDisplay`, `stGetCache`, `stSetCache`, `stIsCacheFresh`, `_stWait`, `stFetch`, `stFetchHolders`, `stFetchHolderChart`, `stFetchOHLCV`, `stFetchWallet`, `stFetchWalletTrades`, `stHolderFromChart`, `updateHolderTimeframeLabels`.

## Data flow
1. `fetchFromCA` (Fetch Data button): resets `window._stHolderData = null`, then auto-fetches holders + chart → fills `fHolders`/`fHoldersH1`/`H6`/`H24` and `tecSaveHolderSnap`.
2. ST OHLCV fallback fires **after** DexScreener note block, only when `_tecEngineMode !== 'STRUCTURE'`.
3. `buildSecurityBriefingHTML`: synchronous IIFE reads `window._stHolderData` and renders the ST Holder Intelligence panel.
4. `wliRunBatch`: fire-and-forget async IIFE enriches up to 5 wallets via `stFetchWallet` + `stFetchWalletTrades`, persists `.stData` to `_walletLibrary`.

## Settings wired
- `sSolanaTrackerKey` (API key), `sSTBudget` (monthly request cap), `sHolderTf1/2/3` (snapshot timeframes in minutes, defaults 1/3/5).
- `holderTf1/2/3` in `DEFAULT_SETTINGS`, read by `applySettingsToUI`/`readSettingsFromUI`/`saveSettings`.
- Holder form labels (`lblHoldersH1/H2/H3`) updated by `updateHolderTimeframeLabels()` — called from `applySettingsToUI` and `saveSettings`.

## Key pitfalls
- **File duplication**: during editing the file ballooned to 5× size (67 769 lines). The `Edit` tool matched the first instance in each duplicated copy, causing divergence. Fixed by `head -16726 > /tmp/first.html && cp back`. **Always verify line count and `</html>` occurrence count after mass edits.**
- **Syntax break**: the ST OHLCV fallback's `window._tecEngineReason` string was truncated mid-literal (newline in string, missing closing braces). Edit tool truncated the large injection. Fixed with Python byte-exact replacement.
- **XSS**: wallet `addr` from ST response was used raw in `href` and innerHTML. Fixed by validating address against `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/` before use; invalid addresses silently become `''`.

## Budget design
- Monthly counter in `tec_st_monthly` (JSON `{month, count}`). Checked before every outbound request. Advisory only — TOCTOU possible but acceptable for UX-level rate guidance.
- Cache keys: `tec_stc_h_{ca}` (holders, 2m TTL), `tec_stc_hc_{ca}` (chart, 5m), `tec_stc_ohlcv_{pool}_{tf}` (120s), `tec_stc_w_{addr}` (wallet, 10m), `tec_stc_wt_{addr}` (trades, 10m).

**Why:** ST is an enrichment-only layer; all existing providers remain authoritative. If ST key is absent or budget is exhausted, the app degrades gracefully to existing behavior.
