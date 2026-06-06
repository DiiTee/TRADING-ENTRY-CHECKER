---
name: HINT MODE — Three-mode Structure Briefing architecture
description: Documents the STRUCTURE/HINT/FLOW three-mode engine added in this session, including trigger logic, data sources, and hard constraints.
---

## Rule
`window._tecEngineMode` now has three states: `'STRUCTURE'` | `'HINT'` | `'FLOW'`.
HINT MODE triggers when OHLCV is unavailable but at least one of: price-change percentages from GT, tx data, volume data, or holder history is available.

**Why:** FLOW mode showed N/A for floor/entry which is low-value — HINT mode uses available market data to estimate a floor and entry range (max confidence tier: C, hard-capped).

## How to apply
- `computeHintStructure(fetched)` — defined before `computeStructuralAnalysis`. Returns null → falls to FLOW. Call it in the HINT trigger block (`/* HINT MODE: attempt... */` section in fetch flow).
- `window._tecGtPoolAttrs` stored globally from the GT pool fetch for `price_change_percentage.h1/.h6/.h24`.
- `window._tecDataAvailability` object tracks: poolFound, gtOhlcv, dexOhlcv, mcHistory, txHistory, holderHistory — read in the Diagnostics Panel.
- Confidence tier hard cap: HINT max = C (score ≤ 64); FLOW max = B (score ≤ 79).
- HINT mode floor injection: `activeShelfMC = window._tecHintStructure.estimatedFloorMC` when null (both render + TXT export `txtActiveShelfMC`).
- `strT` / `_strT2` / `wlBuildEntry` / `wlSyncEntry` all have HINT fallback: `_hs.hintTier` when `sa` is null.
- Diagnostics Panel (collapsible via `_pfToggle`) appears in ALL three modes, placed after the Data Coverage Panel in the '06' entry row IIFE.
