# Trading Entry Checker (TEC)

A specialized analytical tool for traders in the Solana ecosystem. Provides multi-layered intelligence to evaluate token safety, social sentiment, and developer reputation before making trading entries.

## Architecture

- **Frontend:** Single-page HTML app (`trading-entry-checker.html`) — all UI logic, CSS, and analytical engines in one file
- **Backend:** Node.js HTTP server (`server.js`) — serves the HTML and proxies social API calls to avoid CORS issues
- **API Layer:** `api/social-scan.js` — handles X/Twitter social data retrieval with fallback logic across multiple providers

## Running the App

The app runs on port 5000 via `node server.js`. The workflow "Start application" handles this automatically.

## External API Integrations

API keys are entered by the user directly in the app's Settings panel (not stored server-side):
- **TwitterAPI.io** — primary X/Twitter data provider
- **GetXAPI** — secondary X/Twitter provider
- **Apify** — tertiary provider with support for 5 configurable actors

## Key Features

- Security Intelligence: detects cabal risks, wallet clusters, and developer self-sniping
- Social Attention: measures mention velocity and sentiment on X and Reddit
- Developer Reputation: analyzes historical launch performance
- Quick Entry Checker (QEC): rapid analysis of contract addresses
- Scan modes: `first_success`, `auto_fallback`, `merge_all`

## User Preferences

- No auth system — the app has no login flow
- API keys are user-managed within the UI, not stored as server secrets
