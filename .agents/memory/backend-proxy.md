---
name: Backend Proxy Architecture
description: Social API proxy architecture — Vercel serverless function replaces browser-side social calls; DexScreener OHLCV does not exist publicly.
---

## Social Scan Proxy

All X/Twitter social API calls (TwitterAPI.io, GetXAPI, Apify) are routed through a Vercel serverless function to avoid CORS.

- **Vercel function**: `api/social-scan.js` — receives POST `{ queries, limit, sinceTs, apiKeys }`, runs provider waterfall, returns tweets + detailed `diagnostics` object.
- **Local dev**: `server.js` (Node.js HTTP) — serves `trading-entry-checker.html` and proxies `POST /api/social-scan` to the same handler. Run with `node server.js` NOT `python3 -m http.server`.
- **Routing**: `vercel.json` routes `/api/social-scan` → serverless function, everything else → HTML file.
- **Frontend**: `callSocialScanAPI(queries, limit, sinceTs)` in the HTML — POSTs to `/api/social-scan`, stores `window._tecSocialDiag` from response diagnostics.
- **Queries**: four keys tried in order — `ca`, `ticker`, `ticker_dollar` (`$POPCAT`), `name`.

**Why:** Browser-side fetches to TwitterAPI.io / GetXAPI / Apify are blocked by CORS on every deployment. The serverless function is the only reliable architecture.

**How to apply:** If social provider calls need to change, edit `api/social-scan.js`. Do NOT add direct browser `fetch()` calls to these providers.

## DexScreener OHLCV

DexScreener's **public API has no OHLCV/candle endpoint**. The `/latest/dex/ohlcv/...` path returns 404 and is not documented. Only their paid Pro API has candles.

- **Use DexScreener for**: pair discovery, liquidity, volume, price change, buy/sell ratios, LP labels.
- **Use GeckoTerminal for**: all OHLCV candle data (15m, 1h). This is the sole public OHLCV source.
- The engine waterfall is: GeckoTerminal → HINT MODE → FLOW MODE (DexScreener OHLCV fallback was removed).

## Diagnostics Panels

- **Structure Diagnostics** (`<details>` panel): added at end of `buildStructureBriefingHTML()` return. Reads `window._tecEngineMode`, `window._tecOhlcvSource`, `window._tecPoolAddress`, `window._tecCandles`.
- **Attention Diagnostics** (`<details>` panel): added at end of `buildAttentionBriefingHTML()` return. Reads `window._tecSocialDiag` (set by `callSocialScanAPI`) and `window._tecSocialRaw`.
