---
name: Structure Diagnostics State
description: Extended window globals used to power the 5-section Structure Diagnostics panel; set during GeckoTerminal fetch, read by _strucDiag IIFE in buildEntryBriefingHTML.
---

## Globals written during GeckoTerminal fetch (step 5 of fetchData)

| Global | Type | Set when |
|---|---|---|
| `window._tecGtCandleCount` | number | Always — 0 if fetch failed |
| `window._tecGtTimeRange` | `{oldest, newest}` Unix timestamps | Only if candles returned |
| `window._tecGtResolution` | string `'15m'` | Always when fetch attempted |
| `window._tecGtTokenAddr` | string (CA) | Always when fetch attempted |
| `window._tecGtPoolAddr` | string | From GT pool attributes or DexScreener |
| `window._tecGtPairAddr` | string | From DexScreener poolAddress |
| `window._tecGtError` | `{failed, msg, raw, httpStatus}` | Only on catch |
| `window._tecEngineReason` | string | Set in STRUCTURE/HINT/FLOW path |

## Reset point
All are reset at the top of `fetchData()` alongside the other `window._tec*` state resets.

## Where read
`_strucDiag` IIFE inside `buildEntryBriefingHTML` (around line 7083 area). The panel has 5 sections: Data Acquisition, Engine Execution, Confidence Calculation, Fallback Trace, Error Reporting.

**Why:** The user needs to diagnose within 5 seconds which source was used, how many candles, why the mode was chosen, why confidence was capped, which fallback fired, and whether any API error occurred — without opening browser DevTools.

## GeckoTerminal error message patterns
Actionable error messages are generated in the catch block for these patterns:
- `fetched.*not defined` → internal JS reference bug (names the pool address)
- HTTP 429 / rate.?limit → rate limited, wait 30–60s
- HTTP 404 / not.?found → pool not indexed
- timeout / timed.?out → GT API slow
- cors / network.?error / failed.?to.?fetch → CORS proxy failed
