---
name: Entry Classification Layer
description: computeStructureReliability() architecture, scoring rules, key design decisions, and integration points in buildEntryBriefingHTML.
---

## Function
`computeStructureReliability(ctx)` — placed directly before `buildEntryBriefingHTML` in trading-entry-checker.html.

## Inputs
```
ctx = { engineMode, candleCount, ageMinutes, sa, hs, currentMC }
```
- `engineMode`: `window._tecEngineMode` (STRUCTURE/HINT/FLOW)
- `candleCount`: `window._tecGtCandleCount` (actual candle count from GT API)
- `ageMinutes`: `analysis.ageMinutes` (coin age in minutes, may be null)
- `sa`: `d.structuralAnalysis` (full SA object or null)
- `hs`: `window._tecHintStructure` (hint structure or null)
- `currentMC`: `d.marketCap`

## Key Design Decisions

**OHLCV Status vs Engine Mode are separate:**
- `ohlcvAvailable = candleCount > 0` (true if ANY candles were retrieved, even 2)
- `structureRan = engineMode === 'STRUCTURE'` (SA engine actually processed candles)
- This prevents the bug where "OHLCV Available" was only true in STRUCTURE mode, hiding candles retrieved but insufficient for full SA.

**Retrace Count source:**
- `sa.higherLows` — swing lows that are higher than the prior swing low = confirmed retrace+bounce events
- Only counted/scored when `structureRan === true`

**Score ranges → Entry Types:**
- DISCOVERY (orange): score < 30 OR ≥2 discovery conditions
- MOMENTUM (yellow): score 31–60
- STRUCTURE (green): score > 60

**Score ranges → Reliability:**
- UNUSABLE: 0–30 (#ff4757)
- ESTIMATED: 31–60 (#ff9800)
- RELIABLE: 61–80 (#00e676)
- HIGH CONFIDENCE: 81–100 (#00ffcc)

**Scoring (simplified):**
- STRUCTURE mode: +15 OHLCV, +2 to +20 candle count, ±12 age, ±10 or 20 retraces, ±15 shelf/defense
- HINT mode with price history: +20 base, +2 to +8 snapshots, ±12 age
- FLOW mode: -5 LP-floor penalty only

**HINT mode base is +20 (not +15 OHLCV)** so that a HINT coin with 3 price snapshots and 4h age can reach ~33 (ESTIMATED/MOMENTUM) — intentionally keeps HINT coins below STRUCTURE tier.

**LP-derived floor penalty:**
- FLOW mode: -5
- HINT mode with lpFloor but histMCCount < 2: -10, `isLPDerived = true`
- isLPDerived also subtracts 20 from floor confidence

## Integration in buildEntryBriefingHTML

Called right after `hs` is defined (before LP Floor calc):
```javascript
var _ecl = computeStructureReliability({ engineMode: ..., candleCount: ..., ageMinutes: ageMin, sa, hs, currentMC });
```

## UI Panel
Item `04d` — "Entry Classification" — inserted between items `04c` (Volume Velocity) and `05` (Safe Entry Range) in the `entryRows` array.

Panel sections:
1. Entry Type badge (DISCOVERY/MOMENTUM/STRUCTURE) + Mode badge + Reliability score
2. Description italic text
3. Data Quality grid: OHLCV Status, Candle Count, Data Sufficiency, Retraces Detected
4. Floor Confidence / Entry Confidence
5. Entry Zone (type-specific):
   - DISCOVERY: Current MC → MC×1.05 participation zone
   - MOMENTUM: MC×0.98–1.05 aggressive / MC×0.95–1.02 safe
   - STRUCTURE: Defers to item 05
6. Price Discovery Active warning (if triggered)
7. Classification Reasoning (factor list)

**The panel is purely additive — never modifies existing floor, shelf, or entry range calculations.**
