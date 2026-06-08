---
name: Social Provider Control System
description: Full provider control panel for X/Twitter social scanning — scan modes, Apify actor selection, per-provider toggles, monthly budget tracking, cost estimation.
---

## localStorage keys

| Key | Type | Default | Purpose |
|---|---|---|---|
| `tec_prov_twitterapi_en` | 'true'/'false' | 'true' | Enable/disable TwitterAPI.io |
| `tec_prov_getxapi_en` | 'true'/'false' | 'true' | Enable/disable GetXAPI |
| `tec_prov_apify_en` | 'true'/'false' | 'true' | Enable/disable Apify |
| `tec_scan_mode` | string | 'auto_fallback' | first_success / auto_fallback / merge_all |
| `tec_apify_actor` | string | 'getxapi_actor' | Which Apify actor to use |
| `tec_budget_twitterapi` | number | 0.10 | Monthly budget cap ($) |
| `tec_budget_getxapi` | number | 0.15 | Monthly budget cap ($) |
| `tec_budget_apify` | number | 5.00 | Monthly budget cap ($) |
| `tec_budget_warn_pct` | number | 80 | Warning threshold % |
| `tec_monthly_spend` | JSON | {} | { month: 'YYYY-MM', twitterapi, getxapi, apify } |

## JS helpers (defined before callSocialScanAPI)
- `getSocialProviderConfig()` — returns { twitterapi, getxapi, apify } (booleans)
- `getScanMode()` — returns scan mode string
- `getApifyActor()` — returns actor key string
- `getMonthlySpend()` — auto-resets on new month
- `addMonthlySpend(provider, amount)` — accumulates fractional $ spend
- `checkBudgetBlock(provider)` — returns { blocked, warning, current, budget }
- `getEffectiveProviderConfig()` — applies budget blocks to user config; returns { config, budgetBlocks, budgetWarnings }
- `updateScanModeHint()` — updates hint text under scan mode dropdown
- `renderMonthlySpendDisplay()` — renders progress bars in #monthlySpendDisplay

## Apify actors and cost rates
| Key | Actor ID | Cost/tweet |
|---|---|---|
| getxapi_actor | getxapi~twitter-scraper | $0.00005 |
| xquik | xquik~x-tweet-scraper | $0.00015 |
| quadraphonic | celebrated-quadraphonic~x-twitter-scraper-v3 | $0.00020 |
| kaitoeasyapi | kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest | $0.00025 |
| igolaizola | igolaizola~x-twitter-scraper-ppe | $0.00015 |

## Scan modes (api/social-scan.js)
- `first_success` / `auto_fallback` — sequential, stop at first provider with results
- `merge_all` — all providers run concurrently via Promise.all, mergeTweets() deduplicates by tweet id

## Response shape (api/social-scan.js)
Returns `{ ...result, diagnostics, providerDiagnostics }` where:
- `diagnostics.scan_mode` — which mode was used
- `diagnostics.apify_actor` — which actor was selected
- `providerDiagnostics[]` — per-provider `{ provider, status, error, tweets, requestTimeMs, costEstimate, costKey }`

## Budget enforcement flow
1. `runSocialScan()` calls `getEffectiveProviderConfig()` which builds budget-adjusted config
2. Budget-blocked providers → `base[p] = false` in returned config
3. `callSocialScanAPI()` sends budget-adjusted `providerConfig` to server
4. Server sees disabled → logs "Provider Disabled By User"
5. After scan, `providerDiagnostics` from response → `addMonthlySpend(costKey, costEstimate)` for each
6. Budget warnings added to `errors[]` for status display

**Why:** User pays per-tweet on PPR Apify actors; accidental merge-all on multiple keys could exhaust a $5 monthly budget in one session. Hard blocks + warning threshold prevent surprise bills.
